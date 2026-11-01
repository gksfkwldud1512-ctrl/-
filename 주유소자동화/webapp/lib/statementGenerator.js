'use strict';
const ExcelJS = require('exceljs');
const path    = require('path');

const STATION = {
  bizNo:   '303-81-64391',
  name:    '(주)미소주유소',
  ceo:     '신정자',
  address: '충북 음성군 대소면 대금로 199  ',
  bizType: '도매및소매업',
  bizItem: '주유소',
};

// 원본 양식과 완전히 동일한 열 너비 (소수점 포함)
const COL_WIDTHS = [
  2.625, 6.625, 1.625, 5.625, 5.625, 8.625, 3.625, 9.625,
  2.625, 6.625, 0,     6.625, 5.625, 7.625, 3.625, 13.625,
];

// ─── 폰트 ──────────────────────────────────────────────────────
// 헤더 영역(1~6행): family:2  |  데이터 영역(8행~): family:3
function fntH(sz, bold = false) {
  return { name: '맑은 고딕', size: sz, bold, family: 2, charset: 129, scheme: 'minor' };
}
function fntD(sz, bold = false) {
  return { name: '맑은 고딕', size: sz, bold, family: 3, charset: 129, scheme: 'minor' };
}

// ─── 테두리 (템플릿과 동일한 indexed:64 색상) ───────────────────
const T = { style: 'thin', color: { indexed: 64 } };
const AB = { top: T, left: T, bottom: T, right: T };
const LR = { left: T, right: T };
const TB = { top: T, bottom: T };

// ─── 셀 헬퍼 ────────────────────────────────────────────────────
function cell(ws, addr, val, opts = {}) {
  const c     = ws.getCell(addr);
  c.value     = val;
  c.font      = opts.font   ?? fntD(9);
  c.alignment = {
    horizontal: opts.h    ?? 'center',
    vertical:   'middle',
    wrapText:   opts.wrap ?? false,
  };
  c.border    = opts.bord ?? AB;
  if (opts.fmt) c.numFmt = opts.fmt;
  return c;
}

function mergeCell(ws, range, val, opts = {}) {
  ws.mergeCells(range);
  return cell(ws, range.split(':')[0], val, opts);
}

// ─── 유종 분류 (taxInvoiceGenerator.calcProducts와 동일 규칙) ────
const FUEL_ORDER = ['휘발유', '경유', '등유'];  // 유종 합계 행 출력 순서
const FUEL_SET   = new Set(FUEL_ORDER);
const ETC_LABEL  = '유외상품';                   // 유종 외 품목(유록스·세차 등) 통합

// ─── 세금 계산 ──────────────────────────────────────────────────
function calcTax(amount, taxType) {
  if (taxType === '면세') return { supply: amount, tax: 0 };
  const supply = Math.round(amount / 1.1);
  return { supply, tax: amount - supply };
}

// ─── 출력방법별 데이터 정렬 ──────────────────────────────────────
function organizeTransactions(txs, printMethod) {
  if (printMethod === '유종별') {
    const pm = {};
    txs.forEach(t => {
      const pk = t.product || '기타';
      if (!pm[pk]) pm[pk] = [];
      pm[pk].push(t);
    });
    return Object.entries(pm).map(([product, list]) => ({
      label: product, product: null,
      txs: list.sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }
  if (printMethod === '판매일자순') {
    return [{ label: null, product: null,
      txs: [...txs].sort((a, b) => a.date.localeCompare(b.date)) }];
  }
  if (printMethod === '차량별-판매일자순') {
    const vm = {};
    txs.forEach(t => {
      const vk = t.vehicle || '(없음)';
      if (!vm[vk]) vm[vk] = [];
      vm[vk].push(t);
    });
    return Object.entries(vm).map(([vehicle, list]) => ({
      label: vehicle, product: null,
      txs: list.sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }
  // 기본: 차량별-유종별
  const vm = {};
  txs.forEach(t => {
    const vk = t.vehicle || '(없음)';
    if (!vm[vk]) vm[vk] = {};
    if (!vm[vk][t.product]) vm[vk][t.product] = [];
    vm[vk][t.product].push(t);
  });
  const groups = [];
  for (const [, prods] of Object.entries(vm)) {
    for (const [product, list] of Object.entries(prods)) {
      groups.push({ label: product, product,
        txs: list.sort((a, b) => a.date.localeCompare(b.date)) });
    }
  }
  return groups;
}

// 출력방법 전체 목록 — 거래명세서 1개 파일에 시트로 모두 수록
const ALL_PRINT_METHODS = ['판매일자순', '유종별', '차량별-판매일자순', '차량별-유종별'];

// 반월(1~15일 / 16일~말일) 판매일자순 시트를 추가로 넣는 업체 (사용자 요청 2026-11-01)
const HALF_MONTH_VENDORS = new Set(['신성기업주식회사']);

// 업체별 추가 시트 (맨 앞에 판매일자순으로 넣음) — 기준: 10월 (주)제론텍 예시 거래명세서
//   match: 이 시트에 넣을 거래, rest: 앞 시트에 안 들어간 나머지 전부
//   fuelDiscount: 유류 L당 할인 → 총합계 아래 할인금액·할인 후 금액 행
//   제론텍 "지게차+3592+말통" = BOS 배달 거래 + 차량칸이 비었거나 지게차/말통/3592가 들어간 거래
const VENDOR_EXTRA_SHEETS = {
  '(주)제론텍': [
    { title: '지게차+3592+말통', fuelDiscount: 30,
      match: t => t.isDelivery || !String(t.vehicle || '').trim() || /지게차|말통|3592/.test(String(t.vehicle)) },
    { title: '배달 외', fuelDiscount: 30, rest: true },
  ],
};

// ─── 시트 1장 작성 (지정한 출력방법으로 정렬) ────────────────────
// opts.fuelDiscount: 유류(휘발유·경유·등유) L당 할인 단가 → 총합계 아래 "할인금액"·"할인 후 금액" 행 추가
function buildStatementSheet(ws, cust, customer, issueDate, printMethod, opts = {}) {
  // ── 열 너비 ────────────────────────────────────────────────────
  COL_WIDTHS.forEach((w, i) => {
    const col = ws.getColumn(i + 1);
    if (w === 0) { col.hidden = true; col.width = 1; }
    else          col.width = w;
  });

  // ── 행 1~2: 제목 (family:2) ────────────────────────────────────
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 18;

  mergeCell(ws, 'A1:L2', '거 래 명 세 서(공급받는자용)', {
    font: fntH(20, true),
    bord: { top: T, left: T, bottom: T, right: T },
  });
  mergeCell(ws, 'M1:N1', '작성일자', { font: fntH(9), bord: { top: T, left: T, bottom: T, right: T } });
  mergeCell(ws, 'O1:P1', issueDate || '2026/06/01', { font: fntH(9), bord: { top: T, left: T, bottom: T, right: T } });
  mergeCell(ws, 'M2:N2', '일련번호',  { font: fntH(9), bord: { top: T, left: T, bottom: T, right: T } });
  mergeCell(ws, 'O2:P2', '',          { font: fntH(9), bord: { top: T, left: T, bottom: T, right: T } });

  // ── 행 3~6: 공급자/공급받는자 정보 (family:2) ──────────────────
  [3, 4, 5, 6].forEach(r => { ws.getRow(r).height = 27; });

  // 공급자 세로 라벨 (A3:A6) – 행마다 다른 테두리
  mergeCell(ws, 'A3:A6', '공\r\n\r\n급\r\n\r\n자', {
    font: fntH(9), wrap: true, bord: { left: T, right: T, top: T, bottom: T },
  });
  // 공급받는자 세로 라벨 (I3:I6)
  mergeCell(ws, 'I3:I6', '공\r\n급\r\n받\r\n는\r\n자', {
    font: fntH(9), wrap: true, bord: { left: T, right: T, top: T, bottom: T },
  });

  // 행 3: 등록번호
  cell(ws, 'B3', '등   록\r\n번   호', {
    font: fntH(9), wrap: true, bord: { left: T, right: T, top: T, bottom: T },
  });
  // 사업자번호 첫 셀: bold + size:14 (템플릿과 동일)
  mergeCell(ws, 'C3:H3', STATION.bizNo, {
    font: fntH(14, true), bord: { left: T, right: T, top: T, bottom: T },
  });
  cell(ws, 'J3', '등   록\r\n번   호', {
    font: fntH(9), wrap: true, bord: { left: T, right: T, top: T, bottom: T },
  });
  mergeCell(ws, 'K3:P3', customer?.bizNo || '', {
    font: fntH(14, true), bord: { left: T, right: T, top: T, bottom: T },
  });

  // 행 4: 상호/법인명 · 성명
  cell(ws, 'B4', '상   호\r\n법인명', {
    font: fntH(9), wrap: true, bord: AB,
  });
  mergeCell(ws, 'C4:F4', STATION.name, {
    font: fntH(9), h: 'left', wrap: true, bord: { left: T, right: T, top: T, bottom: T },
  });
  cell(ws, 'G4', '성명', { font: fntH(9), bord: AB });
  cell(ws, 'H4', STATION.ceo, {
    font: fntH(9), h: 'left', wrap: true, bord: AB,
  });
  cell(ws, 'J4', '상   호\r\n법인명', {
    font: fntH(9), wrap: true, bord: AB,
  });
  mergeCell(ws, 'K4:N4', cust.name, {
    font: fntH(9), h: 'left', wrap: true, bord: { left: T, right: T, top: T, bottom: T },
  });
  cell(ws, 'O4', '성명', { font: fntH(9), bord: AB });
  cell(ws, 'P4', customer?.contactName || '', {
    font: fntH(9), wrap: true, bord: AB,
  });

  // 행 5: 사업장 주소
  cell(ws, 'B5', '사업장\r\n주   소', {
    font: fntH(9), wrap: true, bord: AB,
  });
  mergeCell(ws, 'C5:H5', STATION.address, {
    font: fntH(9), h: 'left', wrap: true, bord: { left: T, right: T, top: T, bottom: T },
  });
  cell(ws, 'J5', '사업장\r\n주   소', {
    font: fntH(9), wrap: true, bord: AB,
  });
  mergeCell(ws, 'K5:P5', customer?.address || '', {
    font: fntH(9), h: 'left', wrap: true, bord: { left: T, right: T, top: T, bottom: T },
  });

  // 행 6: 업태 · 종목
  cell(ws, 'B6', '업   태', { font: fntH(9), bord: AB });
  mergeCell(ws, 'C6:E6', STATION.bizType, {
    font: fntH(9), h: 'left', wrap: true, bord: { left: T, right: T, top: T, bottom: T },
  });
  cell(ws, 'F6', '종   목', { font: fntH(9), bord: AB });
  mergeCell(ws, 'G6:H6', STATION.bizItem, {
    font: fntH(9), h: 'left', wrap: true, bord: { left: T, right: T, top: T, bottom: T },
  });
  cell(ws, 'J6', '업   태', { font: fntH(9), bord: AB });
  mergeCell(ws, 'K6:M6', customer?.bizType || '', { font: fntH(9), bord: AB });
  cell(ws, 'N6', '종   목', { font: fntH(9), bord: AB });
  mergeCell(ws, 'O6:P6', customer?.bizItem || '', { font: fntH(9), bord: AB });

  // ── 행 7: 구분선 (높이 6.95, 원본과 동일) ─────────────────────
  ws.getRow(7).height = 6.95;

  // ── 행 8: 테이블 헤더 (family:3, 높이 지정 없음) ──────────────
  [
    ['A8:B8', '판매일자'],
    ['C8:E8', '대상(차량)'],
    ['F8',    '품목'],
    ['G8',    '규격'],
    ['H8',    '수량'],
    ['I8:K8', '단가'],
    ['L8:M8', '공급가'],
    ['N8:O8', '부가세'],
    ['P8',    '판매금액'],
  ].forEach(([rng, val]) => mergeCell(ws, rng, val, { font: fntD(9) }));

  // ── 데이터 행 (출력방법 적용) ────────────────────────────────
  const groups        = organizeTransactions(cust.txs, printMethod);
  const showSubtotals = printMethod !== '판매일자순';

  // 유종별 합계: 출력방법과 무관하게 거래 원본에서 직접 집계
  const fuelTotals = {};  // { '경유': { qty, sup, tax, amt }, ... }
  let gQty = 0, gSup = 0, gTax = 0, gAmt = 0;
  let r = 9;

  for (const group of groups) {
    let vQty = 0, vSup = 0, vTx = 0, vAmt = 0;

    group.txs.forEach(t => {
      const { supply, tax } = calcTax(t.amount, t.taxType);
      const qty = Math.floor(t.qty);  // 소수점 절사
      mergeCell(ws, `A${r}:B${r}`, t.date,         { font: fntD(9) });
      mergeCell(ws, `C${r}:E${r}`, t.vehicle || '', { font: fntD(9) });
      cell(ws,      `F${r}`,       t.product,       { font: fntD(9) });
      cell(ws,      `G${r}`,       'L',             { font: fntD(9) });
      cell(ws,      `H${r}`,       qty,             { font: fntD(9), fmt: '#,##0' });
      mergeCell(ws, `I${r}:K${r}`, t.unitPrice,    { font: fntD(9), h: 'right', fmt: '#,##0' });
      mergeCell(ws, `L${r}:M${r}`, supply,          { font: fntD(9), h: 'right', fmt: '#,##0' });
      mergeCell(ws, `N${r}:O${r}`, tax,             { font: fntD(9), h: 'right', fmt: '#,##0' });
      cell(ws,      `P${r}`,       t.amount,        { font: fntD(9), h: 'right', fmt: '#,##0' });
      vQty += qty; vSup += supply; vTx += tax; vAmt += t.amount;

      // 유종별 누적 — 위에서 쓴 값 그대로 재사용해야 총합계와 정확히 일치
      const fk = FUEL_SET.has(t.product) ? t.product : ETC_LABEL;
      if (!fuelTotals[fk]) fuelTotals[fk] = { qty: 0, sup: 0, tax: 0, amt: 0 };
      fuelTotals[fk].qty += qty;
      fuelTotals[fk].sup += supply;
      fuelTotals[fk].tax += tax;
      fuelTotals[fk].amt += t.amount;

      r++;
    });

    if (showSubtotals && group.label) {
      mergeCell(ws, `A${r}:B${r}`, '',                   { font: fntD(9) });
      mergeCell(ws, `C${r}:E${r}`, '',                   { font: fntD(9) });
      cell(ws,      `F${r}`,       `${group.label} 계`,  { font: fntD(9, true) });
      cell(ws,      `G${r}`,       'L',                   { font: fntD(9, true) });
      cell(ws,      `H${r}`,       vQty,                  { font: fntD(9, true), fmt: '#,##0' });
      mergeCell(ws, `I${r}:K${r}`, 0,                    { font: fntD(9, true), h: 'center' });
      mergeCell(ws, `L${r}:M${r}`, vSup,                 { font: fntD(9, true), h: 'right', fmt: '#,##0' });
      mergeCell(ws, `N${r}:O${r}`, vTx,                  { font: fntD(9, true), h: 'right', fmt: '#,##0' });
      cell(ws,      `P${r}`,       vAmt,                  { font: fntD(9, true), h: 'right', fmt: '#,##0' });
      r++;
    }

    gQty += vQty; gSup += vSup; gTax += vTx; gAmt += vAmt;
  }

  // ── 유종별 합계 행 (거래가 있는 유종만, 총합계 바로 위) ─────────
  for (const label of [...FUEL_ORDER, ETC_LABEL]) {
    const tot = fuelTotals[label];
    if (!tot) continue;
    ws.getRow(r).height = 17.25;
    mergeCell(ws, `A${r}:G${r}`, `${label} 합계`, { font: fntD(12, true) });
    cell(ws,      `H${r}`,       tot.qty,          { font: fntD(12, true), fmt: '#,##0' });
    mergeCell(ws, `I${r}:K${r}`, '',               { font: fntD(12, true) });
    mergeCell(ws, `L${r}:M${r}`, tot.sup,         { font: fntD(12, true), h: 'right', fmt: '#,##0' });
    mergeCell(ws, `N${r}:O${r}`, tot.tax,         { font: fntD(12, true), h: 'right', fmt: '#,##0' });
    cell(ws,      `P${r}`,       tot.amt,         { font: fntD(12, true), h: 'right', fmt: '#,##0' });
    r++;
  }

  // ── 총합계 행 ────────────────────────────────────────────────
  ws.getRow(r).height = 17.25;
  mergeCell(ws, `A${r}:G${r}`, '총합계',            { font: fntD(12, true) });
  cell(ws,      `H${r}`,       gQty,                { font: fntD(12, true), fmt: '#,##0' });
  mergeCell(ws, `I${r}:K${r}`, '',                  { font: fntD(12, true) });
  mergeCell(ws, `L${r}:M${r}`, gSup,               { font: fntD(12, true), h: 'right', fmt: '#,##0' });
  mergeCell(ws, `N${r}:O${r}`, gTax,               { font: fntD(12, true), h: 'right', fmt: '#,##0' });
  cell(ws,      `P${r}`,       gAmt,               { font: fntD(12, true), h: 'right', fmt: '#,##0' });

  // ── 유가보조금 카드 결제 업체: 총합계 아래 "유가보조 지원 결제금액"·"세금계산서 발행금액" ─────
  const subsidyTxs = cust.txs.filter(t => t.subsidyCard);
  if (subsidyTxs.length) {
    let sQty = 0, sSup = 0, sTax = 0, sAmt = 0;
    subsidyTxs.forEach(t => {
      const { supply, tax } = calcTax(Number(t.amount) || 0, t.taxType);
      sQty += Math.floor(Number(t.qty) || 0); sSup += supply; sTax += tax; sAmt += Number(t.amount) || 0;
    });
    const big = fntD(12, true);
    const pending = subsidyTxs.some(t => t.subsidyPending);
    const rowsOut = [
      [pending ? '유가보조 지원 결제금액 (정산 전·카드승인 기준)' : '유가보조 지원 결제금액 (정산 확인)', sQty, sSup, sTax, sAmt],
      ['세금계산서 발행금액',          gQty - sQty, gSup - sSup, gTax - sTax, gAmt - sAmt],
    ];
    for (const [label, q, sp, tx, am] of rowsOut) {
      r++;
      ws.getRow(r).height = 17.25;
      mergeCell(ws, `A${r}:G${r}`, label, { font: big });
      cell(ws,      `H${r}`,       q,     { font: big, fmt: '#,##0' });
      mergeCell(ws, `I${r}:K${r}`, '',    { font: big });
      mergeCell(ws, `L${r}:M${r}`, sp,    { font: big, h: 'right', fmt: '#,##0' });
      mergeCell(ws, `N${r}:O${r}`, tx,    { font: big, h: 'right', fmt: '#,##0' });
      cell(ws,      `P${r}`,       am,    { font: big, h: 'right', fmt: '#,##0' });
    }
  }

  // ── 유류 할인 (제론텍 예시 양식: 할인금액 = 유류 수량 × L당 할인단가) ─────
  const disc = Number(opts.fuelDiscount) || 0;
  if (disc > 0) {
    const fuelQty = FUEL_ORDER.reduce((s, f) => s + (fuelTotals[f]?.qty || 0), 0);
    const dAmt = fuelQty * disc;
    const dSup = Math.round(dAmt / 1.1);
    const dTax = dAmt - dSup;
    // 할인 후 단가: 유종별 판매단가 − 할인단가 (월중 단가가 바뀌었으면 모두 표시)
    const after = FUEL_ORDER.map(f => {
      const prices = [...new Set(cust.txs.filter(t => t.product === f).map(t => Number(t.unitPrice) || 0))]
        .filter(Boolean).sort((a, b) => b - a);
      if (!prices.length) return '';
      if (prices.length > 2) return `${f} 단가-${disc}`;   // 월중 단가 변동이 많으면 칸이 넘쳐서 요약
      return `${f} ${prices.map(x => (x - disc).toLocaleString()).join('/')}`;
    }).filter(Boolean).join('\n');
    const big = fntD(12, true);
    r++;
    ws.getRow(r).height = 17.25;
    mergeCell(ws, `A${r}:G${r}`, `할인금액 (유류 L당 ${disc}원)`, { font: big });
    cell(ws,      `H${r}`,       fuelQty,           { font: big, fmt: '#,##0' });
    mergeCell(ws, `I${r}:K${r}`, disc,              { font: big, fmt: '#,##0' });
    mergeCell(ws, `L${r}:M${r}`, dSup,              { font: big, h: 'right', fmt: '#,##0' });
    mergeCell(ws, `N${r}:O${r}`, dTax,              { font: big, h: 'right', fmt: '#,##0' });
    cell(ws,      `P${r}`,       dAmt,              { font: big, h: 'right', fmt: '#,##0' });
    r++;
    const lines = Math.max(1, after.split('\n').length);
    ws.getRow(r).height = Math.max(17.25, lines * 12.5);
    mergeCell(ws, `A${r}:G${r}`, '할인 후 금액',     { font: big });
    cell(ws,      `H${r}`,       gQty,              { font: big, fmt: '#,##0' });
    mergeCell(ws, `I${r}:K${r}`, after,             { font: fntD(8, true), wrap: true });
    mergeCell(ws, `L${r}:M${r}`, gSup - dSup,       { font: big, h: 'right', fmt: '#,##0' });
    mergeCell(ws, `N${r}:O${r}`, gTax - dTax,       { font: big, h: 'right', fmt: '#,##0' });
    cell(ws,      `P${r}`,       gAmt - dAmt,       { font: big, h: 'right', fmt: '#,##0' });
  }
}

// ─── 거래명세서 생성 (출력방법별 시트 전체 수록) ──────────────────
async function createStatement(cust, customer, outputDir, issueDate, year, month, printMethod, fileSuffix = '') {
  const wb = new ExcelJS.Workbook();

  // 고객에 지정된 출력방법을 첫 시트로, 나머지 방식은 뒤에 순서대로
  const primary = ALL_PRINT_METHODS.includes(printMethod) ? printMethod : '차량별-유종별';
  const methods = [primary, ...ALL_PRINT_METHODS.filter(m => m !== primary)];

  // 업체별 추가 시트 (맨 앞)
  const extra = VENDOR_EXTRA_SHEETS[cust.name];
  if (extra) {
    const used = new Set();
    extra.forEach(sh => {
      const txs = cust.txs.filter(t => !used.has(t) && (sh.rest || sh.match(t)));
      txs.forEach(t => used.add(t));
      if (!txs.length) return;
      const ws = wb.addWorksheet(sh.title, {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      });
      buildStatementSheet(ws, { ...cust, txs }, customer, issueDate, '판매일자순', { fuelDiscount: sh.fuelDiscount });
    });
  }

  methods.forEach(m => {
    const ws = wb.addWorksheet(m, {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });
    buildStatementSheet(ws, cust, customer, issueDate, m);
  });

  // 반월 나눔 업체: 판매일자순으로 1~15일 / 16일~말일 시트 2장 추가
  if (HALF_MONTH_VENDORS.has(cust.name)) {
    const day = t => Number(String(t.date).replace(/-/g, '/').split('/')[2]) || 0;
    const lastDay = new Date(Number(year || 2026), Number(month || 1), 0).getDate();
    const halves = [
      { title: '1~15일',             txs: cust.txs.filter(t => day(t) <= 15) },
      { title: `16~${lastDay}일`,    txs: cust.txs.filter(t => day(t) >= 16) },
    ];
    halves.forEach(h => {
      if (!h.txs.length) return;
      const ws = wb.addWorksheet(`판매일자순(${h.title})`, {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      });
      buildStatementSheet(ws, { ...cust, txs: h.txs }, customer, issueDate, '판매일자순');
    });
  }

  // ── 저장 ─────────────────────────────────────────────────────
  const safeName = cust.name.replace(/[\\/:*?"<>|]/g, '_');
  const yr = String(year || 2026);
  const mo = String(month || 5).padStart(2, '0');
  const suffix = fileSuffix ? `_${fileSuffix}` : '';
  const filename = `${yr}년${mo}월_거래명세서_${safeName}${suffix}.xlsx`;
  await wb.xlsx.writeFile(path.join(outputDir, filename));
  return filename;
}

async function generateStatements(vendors, customers, outputDir, issueDate, year, month, printMethods = {}, splitDeliveryMap = {}) {
  const files = [];
  for (const v of vendors) {
    const customer      = customers.find(c => c.name === v.name) || null;
    const printMethod   = printMethods[v.name] || customer?.printMethod || '';
    const splitDelivery = splitDeliveryMap[v.name] ?? customer?.splitDelivery ?? false;

    if (splitDelivery && v.txs.some(t => t.isDelivery) && v.txs.some(t => !t.isDelivery)) {
      // 배달 분리 발행: 스탠드 내역, 배달 내역 각각 1부
      const standVendor   = { ...v, txs: v.txs.filter(t => !t.isDelivery) };
      const delivVendor   = { ...v, txs: v.txs.filter(t =>  t.isDelivery) };
      const standFile = await createStatement(standVendor, customer, outputDir, issueDate, year, month, printMethod || '판매일자순', '스탠드');
      const delivFile = await createStatement(delivVendor, customer, outputDir, issueDate, year, month, printMethod || '판매일자순', '배달');
      files.push(standFile, delivFile);
    } else {
      const filename = await createStatement(v, customer, outputDir, issueDate, year, month, printMethod);
      files.push(filename);
    }
  }
  return files;
}

module.exports = { generateStatements, buildStatementSheet, ALL_PRINT_METHODS };
