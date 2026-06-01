'use strict';

const ExcelJS = require('./node_modules/exceljs');
const XLSX = require('./node_modules/xlsx');
const path = require('path');
const fs = require('fs');

// ─── 주유소 정보 (양식에서 확인) ───────────────────────────────
const STATION = {
  bizNo:   '303-81-64391',
  name:    '(주)미소주유소',
  ceo:     '신정자',
  address: '충북 음성군 대소면 대금로 199',
  bizType: '도매및소매업',
  bizItem: '주유소',
};

const INPUT   = path.join(__dirname, '5월 업체별 상세거래내역서.xlsx');
const OUT_DIR = path.join(__dirname, '거래명세서');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

// ─── 원본 데이터 읽기 ──────────────────────────────────────────
const srcWb   = XLSX.readFile(INPUT);
const srcRows = XLSX.utils.sheet_to_json(srcWb.Sheets['Sheet1'], { header: 1 })
  .slice(3)
  .filter(r => r[0] != null);

// 외상 거래만 업체별 집계
const custMap = {};
srcRows.forEach(r => {
  if (r[8] !== '외상') return;
  const n = r[4];
  if (!custMap[n]) custMap[n] = { name: n, no: r[3], total: 0, txs: [] };
  custMap[n].total += r[14] || 0;
  custMap[n].txs.push({
    date:      r[1],
    vehicle:   r[6] || '',
    product:   r[11],
    unit:      'L',
    qty:       r[12],
    unitPrice: r[13],
    amount:    r[14],
    taxType:   r[17],
  });
});

// 거래금액 오름차순 하위 5개
const targets = Object.values(custMap).sort((a, b) => a.total - b.total).slice(0, 5);
console.log('생성 대상:');
targets.forEach(c => console.log(`  - ${c.name}: ${c.total.toLocaleString()}원`));

// ─── 유틸 함수 ────────────────────────────────────────────────
function calcTax(amount, taxType) {
  if (taxType === '면세') return { supply: amount, tax: 0 };
  const supply = Math.round(amount / 1.1);
  return { supply, tax: amount - supply };
}

// ─── ExcelJS 스타일 상수 ──────────────────────────────────────
const thin = { style: 'thin' };
const AB   = { top: thin, left: thin, bottom: thin, right: thin };   // all borders
const LR   = { left: thin, right: thin };                             // left+right only
const fnt  = (sz, bold = false) => ({ name: '맑은 고딕', size: sz, bold, charset: 129 });

// ─── 셀 설정 헬퍼 ─────────────────────────────────────────────
function cell(ws, addr, val, opts = {}) {
  const c = ws.getCell(addr);
  c.value       = val;
  c.font        = opts.font   ?? fnt(9);
  c.alignment   = { horizontal: opts.h ?? 'center', vertical: 'middle',
                    wrapText: opts.wrap ?? false };
  c.border      = opts.bord  ?? AB;
  if (opts.fmt) c.numFmt = opts.fmt;
  return c;
}

// 병합 후 셀 설정 (첫 번째 주소 자동 추출)
function mergeCell(ws, range, val, opts = {}) {
  ws.mergeCells(range);
  return cell(ws, range.split(':')[0], val, opts);
}

// ─── 거래명세서 생성 ──────────────────────────────────────────
async function createStatement(cust) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('거래명세서', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  // 열 너비 (A=1 ~ P=16), K(11)은 숨김
  // 양식 원본 wch 값 기준
  const colW = [3, 7, 2, 6, 6, 9, 4, 10, 3, 7, 0, 7, 6, 8, 4, 14];
  colW.forEach((w, i) => {
    const col = ws.getColumn(i + 1);
    if (w === 0) { col.hidden = true; col.width = 1; }
    else col.width = w;
  });

  // ── 행 1~2: 제목 ──────────────────────────────────────────
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 18;

  mergeCell(ws, 'A1:L2', '거 래 명 세 서(공급받는자용)', {
    font: fnt(20, true), bord: AB,
  });
  mergeCell(ws, 'M1:N1', '작성일자');
  mergeCell(ws, 'O1:P1', '2026/06/01');
  mergeCell(ws, 'M2:N2', '일련번호');
  mergeCell(ws, 'O2:P2', '');

  // ── 행 3~6: 공급자 / 공급받는자 정보 ──────────────────────
  [3, 4, 5, 6].forEach(r => { ws.getRow(r).height = 27; });

  // 공급자 세로 라벨 (A3:A6)
  mergeCell(ws, 'A3:A6', '공\n\n급\n\n자', { wrap: true });

  // 공급받는자 세로 라벨 (I3:I6)  ※ K열이 hidden이므로 I열 기준
  mergeCell(ws, 'I3:I6', '공\n급\n받\n는\n자', { wrap: true, bord: LR });

  // 행 3: 등록번호
  cell(ws,  'B3', '등   록\n번   호', { wrap: true });
  mergeCell(ws, 'C3:H3', STATION.bizNo);
  cell(ws,  'J3', '등   록\n번   호', { wrap: true });
  mergeCell(ws, 'K3:P3', '');          // 거래처 사업자번호 (미상 → 빈칸)

  // 행 4: 상호/법인명 · 성명
  cell(ws,  'B4', '상   호\n법인명', { wrap: true });
  mergeCell(ws, 'C4:F4', STATION.name,  { h: 'left' });
  cell(ws,  'G4', '성명');
  cell(ws,  'H4', STATION.ceo);
  cell(ws,  'J4', '상   호\n법인명', { wrap: true });
  mergeCell(ws, 'K4:N4', cust.name, { h: 'left' });
  cell(ws,  'O4', '성명');
  cell(ws,  'P4', '');

  // 행 5: 사업장 주소
  cell(ws,  'B5', '사업장\n주   소', { wrap: true });
  mergeCell(ws, 'C5:H5', STATION.address, { h: 'left' });
  cell(ws,  'J5', '사업장\n주   소', { wrap: true });
  mergeCell(ws, 'K5:P5', '', { h: 'left' });

  // 행 6: 업태 · 종목
  cell(ws,  'B6', '업   태');
  mergeCell(ws, 'C6:E6', STATION.bizType, { h: 'left' });
  cell(ws,  'F6', '종   목');
  mergeCell(ws, 'G6:H6', STATION.bizItem, { h: 'left' });
  cell(ws,  'J6', '업   태');
  mergeCell(ws, 'K6:M6', '');
  cell(ws,  'N6', '종   목');
  mergeCell(ws, 'O6:P6', '');

  // ── 행 7: 구분선 (여백) ────────────────────────────────────
  ws.getRow(7).height = 7;

  // ── 행 8: 테이블 헤더 ─────────────────────────────────────
  ws.getRow(8).height = 20;
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
  ].forEach(([rng, val]) => mergeCell(ws, rng, val));

  // ── 데이터 행 ─────────────────────────────────────────────
  // 차량 → 유종 → 날짜 순 그룹화
  const vehicleMap = {};
  cust.txs.forEach(t => {
    const vk = t.vehicle || '(없음)';
    if (!vehicleMap[vk]) vehicleMap[vk] = {};
    if (!vehicleMap[vk][t.product]) vehicleMap[vk][t.product] = [];
    vehicleMap[vk][t.product].push(t);
  });

  const productTotals = {};          // { 유종: { qty, sup, tax, amt } }
  let gQty = 0, gSup = 0, gTax = 0, gAmt = 0;
  let r = 9;

  for (const [veh, prods] of Object.entries(vehicleMap)) {
    for (const [prod, txs] of Object.entries(prods)) {
      const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
      let vQty = 0, vSup = 0, vTx = 0, vAmt = 0;

      // 개별 거래 행
      sorted.forEach(t => {
        const { supply, tax } = calcTax(t.amount, t.taxType);
        ws.getRow(r).height = 15;

        mergeCell(ws, `A${r}:B${r}`, t.date.replace(/-/g, '/'));
        mergeCell(ws, `C${r}:E${r}`, t.vehicle);
        cell(ws, `F${r}`, prod);
        cell(ws, `G${r}`, 'L');
        cell(ws, `H${r}`, t.qty,       { fmt: '#,##0.00' });
        mergeCell(ws, `I${r}:K${r}`, t.unitPrice, { h: 'right', fmt: '#,##0' });
        mergeCell(ws, `L${r}:M${r}`, supply,      { h: 'right', fmt: '#,##0' });
        mergeCell(ws, `N${r}:O${r}`, tax,          { h: 'right', fmt: '#,##0' });
        cell(ws, `P${r}`, t.amount,    { h: 'right', fmt: '#,##0' });

        vQty += t.qty; vSup += supply; vTx += tax; vAmt += t.amount;
        r++;
      });

      // 차량별 소계 행 ("경유 계" 등)
      ws.getRow(r).height = 15;
      mergeCell(ws, `A${r}:B${r}`, '');
      mergeCell(ws, `C${r}:E${r}`, '');
      cell(ws, `F${r}`, `${prod} 계`,  { font: fnt(9, true) });
      cell(ws, `G${r}`, 'L',           { font: fnt(9, true) });
      cell(ws, `H${r}`, vQty,          { font: fnt(9, true), fmt: '#,##0.00' });
      mergeCell(ws, `I${r}:K${r}`, 0,  { font: fnt(9, true), h: 'center' });
      mergeCell(ws, `L${r}:M${r}`, vSup, { font: fnt(9, true), h: 'right', fmt: '#,##0' });
      mergeCell(ws, `N${r}:O${r}`, vTx,  { font: fnt(9, true), h: 'right', fmt: '#,##0' });
      cell(ws, `P${r}`, vAmt, { font: fnt(9, true), h: 'right', fmt: '#,##0' });
      r++;

      // 유종별 합산 누적
      if (!productTotals[prod]) productTotals[prod] = { qty: 0, sup: 0, tax: 0, amt: 0 };
      productTotals[prod].qty += vQty;
      productTotals[prod].sup += vSup;
      productTotals[prod].tax += vTx;
      productTotals[prod].amt += vAmt;
      gQty += vQty; gSup += vSup; gTax += vTx; gAmt += vAmt;
    }
  }

  // 유종 합계 행 ("경유 합계" 등)
  for (const [prod, tot] of Object.entries(productTotals)) {
    ws.getRow(r).height = 17;
    mergeCell(ws, `A${r}:G${r}`, `${prod} 합계`, { font: fnt(12, true) });
    cell(ws, `H${r}`, tot.qty, { font: fnt(12, true), fmt: '#,##0.00' });
    mergeCell(ws, `I${r}:K${r}`, '', { font: fnt(12, true) });
    mergeCell(ws, `L${r}:M${r}`, tot.sup, { font: fnt(12, true), h: 'right', fmt: '#,##0' });
    mergeCell(ws, `N${r}:O${r}`, tot.tax, { font: fnt(12, true), h: 'right', fmt: '#,##0' });
    cell(ws, `P${r}`, tot.amt, { font: fnt(12, true), h: 'right', fmt: '#,##0' });
    r++;
  }

  // 총합계 행
  ws.getRow(r).height = 17;
  mergeCell(ws, `A${r}:G${r}`, '총합계', { font: fnt(12, true) });
  cell(ws, `H${r}`, gQty, { font: fnt(12, true), fmt: '#,##0.00' });
  mergeCell(ws, `I${r}:K${r}`, '', { font: fnt(12, true) });
  mergeCell(ws, `L${r}:M${r}`, gSup, { font: fnt(12, true), h: 'right', fmt: '#,##0' });
  mergeCell(ws, `N${r}:O${r}`, gTax, { font: fnt(12, true), h: 'right', fmt: '#,##0' });
  cell(ws, `P${r}`, gAmt, { font: fnt(12, true), h: 'right', fmt: '#,##0' });

  // 저장
  const safeName = cust.name.replace(/[\\/:*?"<>|]/g, '_');
  const outFile  = path.join(OUT_DIR, `2026년05월_거래명세서_${safeName}.xlsx`);
  await wb.xlsx.writeFile(outFile);
  console.log(`  ✅ 저장: 2026년05월_거래명세서_${safeName}.xlsx`);
}

// ─── 실행 ─────────────────────────────────────────────────────
(async () => {
  console.log('\n거래명세서 생성 시작...');
  for (const c of targets) await createStatement(c);
  console.log(`\n완료 — 저장 위치: ${OUT_DIR}`);
})();
