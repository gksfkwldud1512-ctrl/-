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

// ─── 세금 계산 ──────────────────────────────────────────────────
function calcTax(amount, taxType) {
  if (taxType === '면세') return { supply: amount, tax: 0 };
  const supply = Math.round(amount / 1.1);
  return { supply, tax: amount - supply };
}

// ─── 거래명세서 생성 ─────────────────────────────────────────────
async function createStatement(cust, customer, outputDir, issueDate, year, month) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('거래명세서', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

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
  cell(ws, 'P4', customer?.manager || '', {
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

  // ── 데이터 행 (family:3, 높이 지정 없음) ─────────────────────
  const vehicleMap = {};
  cust.txs.forEach(t => {
    const vk = t.vehicle || '(없음)';
    if (!vehicleMap[vk]) vehicleMap[vk] = {};
    if (!vehicleMap[vk][t.product]) vehicleMap[vk][t.product] = [];
    vehicleMap[vk][t.product].push(t);
  });

  const productTotals = {};
  let gQty = 0, gSup = 0, gTax = 0, gAmt = 0;
  let r = 9;

  for (const [, prods] of Object.entries(vehicleMap)) {
    for (const [prod, txs] of Object.entries(prods)) {
      const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
      let vQty = 0, vSup = 0, vTx = 0, vAmt = 0;

      sorted.forEach(t => {
        const { supply, tax } = calcTax(t.amount, t.taxType);
        // 높이 지정 없음 (원본 양식 기본값 사용)
        mergeCell(ws, `A${r}:B${r}`, t.date,       { font: fntD(9) });
        mergeCell(ws, `C${r}:E${r}`, t.vehicle,    { font: fntD(9) });
        cell(ws,      `F${r}`,       prod,          { font: fntD(9) });
        cell(ws,      `G${r}`,       'L',           { font: fntD(9) });
        cell(ws,      `H${r}`,       t.qty,         { font: fntD(9), fmt: '#,##0.00' });
        mergeCell(ws, `I${r}:K${r}`, t.unitPrice,  { font: fntD(9), h: 'right', fmt: '#,##0' });
        mergeCell(ws, `L${r}:M${r}`, supply,        { font: fntD(9), h: 'right', fmt: '#,##0' });
        mergeCell(ws, `N${r}:O${r}`, tax,            { font: fntD(9), h: 'right', fmt: '#,##0' });
        cell(ws,      `P${r}`,       t.amount,      { font: fntD(9), h: 'right', fmt: '#,##0' });

        vQty += t.qty; vSup += supply; vTx += tax; vAmt += t.amount;
        r++;
      });

      // 소계 행
      mergeCell(ws, `A${r}:B${r}`, '',              { font: fntD(9) });
      mergeCell(ws, `C${r}:E${r}`, '',              { font: fntD(9) });
      cell(ws,      `F${r}`,       `${prod} 계`,    { font: fntD(9, true) });
      cell(ws,      `G${r}`,       'L',              { font: fntD(9, true) });
      cell(ws,      `H${r}`,       vQty,             { font: fntD(9, true), fmt: '#,##0.00' });
      mergeCell(ws, `I${r}:K${r}`, 0,               { font: fntD(9, true), h: 'center' });
      mergeCell(ws, `L${r}:M${r}`, vSup,            { font: fntD(9, true), h: 'right', fmt: '#,##0' });
      mergeCell(ws, `N${r}:O${r}`, vTx,             { font: fntD(9, true), h: 'right', fmt: '#,##0' });
      cell(ws,      `P${r}`,       vAmt,             { font: fntD(9, true), h: 'right', fmt: '#,##0' });
      r++;

      if (!productTotals[prod]) productTotals[prod] = { qty: 0, sup: 0, tax: 0, amt: 0 };
      productTotals[prod].qty += vQty;
      productTotals[prod].sup += vSup;
      productTotals[prod].tax += vTx;
      productTotals[prod].amt += vAmt;
      gQty += vQty; gSup += vSup; gTax += vTx; gAmt += vAmt;
    }
  }

  // ── 유종 합계 행 (높이 17.25, family:3) ─────────────────────
  for (const [prod, tot] of Object.entries(productTotals)) {
    ws.getRow(r).height = 17.25;
    mergeCell(ws, `A${r}:G${r}`, `${prod} 합계`,  { font: fntD(12, true) });
    cell(ws,      `H${r}`,       tot.qty,          { font: fntD(12, true), fmt: '#,##0.00' });
    mergeCell(ws, `I${r}:K${r}`, '',               { font: fntD(12, true) });
    mergeCell(ws, `L${r}:M${r}`, tot.sup,          { font: fntD(12, true), h: 'right', fmt: '#,##0' });
    mergeCell(ws, `N${r}:O${r}`, tot.tax,          { font: fntD(12, true), h: 'right', fmt: '#,##0' });
    cell(ws,      `P${r}`,       tot.amt,          { font: fntD(12, true), h: 'right', fmt: '#,##0' });
    r++;
  }

  // ── 총합계 행 (높이 17.25) ───────────────────────────────────
  ws.getRow(r).height = 17.25;
  mergeCell(ws, `A${r}:G${r}`, '총합계',           { font: fntD(12, true) });
  cell(ws,      `H${r}`,       gQty,               { font: fntD(12, true), fmt: '#,##0.00' });
  mergeCell(ws, `I${r}:K${r}`, '',                 { font: fntD(12, true) });
  mergeCell(ws, `L${r}:M${r}`, gSup,              { font: fntD(12, true), h: 'right', fmt: '#,##0' });
  mergeCell(ws, `N${r}:O${r}`, gTax,              { font: fntD(12, true), h: 'right', fmt: '#,##0' });
  cell(ws,      `P${r}`,       gAmt,              { font: fntD(12, true), h: 'right', fmt: '#,##0' });

  // ── 저장 ─────────────────────────────────────────────────────
  const safeName = cust.name.replace(/[\\/:*?"<>|]/g, '_');
  const yr = String(year || 2026);
  const mo = String(month || 5).padStart(2, '0');
  const filename = `${yr}년${mo}월_거래명세서_${safeName}.xlsx`;
  await wb.xlsx.writeFile(path.join(outputDir, filename));
  return filename;
}

async function generateStatements(vendors, customers, outputDir, issueDate, year, month) {
  const files = [];
  for (const v of vendors) {
    const customer = customers.find(c => c.name === v.name) || null;
    const filename  = await createStatement(v, customer, outputDir, issueDate, year, month);
    files.push(filename);
  }
  return files;
}

module.exports = { generateStatements };
