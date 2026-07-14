// (주)중앙안전유리 새벽 1시~6시(01:00:00~05:59:59) 차량별 월별 매출액/영업이익 시트 생성
// 실행: node scripts/dawn-vehicle-report-jungang.js
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TARGET_FILE = path.join(__dirname, '..', '1월~6월 상세거래내역.xlsx');
const SHEET_NAME = '중앙안전유리 새벽 차량별';
const TARGET_CUSTOMER = '(주)중앙안전유리';
const FUELS = ['경유', '휘발유'];
const MONTHS = ['01', '02', '03', '04', '05', '06'];

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

const prices = readJSON(path.join(DATA_DIR, 'purchase_prices.json'), []);
const fifoDaily = readJSON(path.join(DATA_DIR, 'fifo_daily_prices.json'), []);
const fifoMap = {};
for (const e of fifoDaily) { if (!fifoMap[e.date]) fifoMap[e.date] = e; }

function getFifoPrice(date, fuel) {
  const fe = fifoMap[date];
  if (fe && fe[fuel]?.price) return fe[fuel].price;
  const list = prices.filter(p => p.fuel === fuel && p.date <= date);
  return list.length ? list[list.length - 1].price : 0;
}

const rawWb = XLSX.readFile(TARGET_FILE);
const rawWs = rawWb.Sheets['Sheet1'];
const raw = XLSX.utils.sheet_to_json(rawWs, { header: 1 });
const dataRows = raw.slice(3).filter(r => r[1]);

// key: 차량번호||유종
const agg = {};

for (const r of dataRows) {
  const custName = String(r[4] || '').trim();
  if (custName !== TARGET_CUSTOMER) continue;

  const dateStr = String(r[1] || '').trim();
  if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
  const month = dateStr.slice(5, 7);
  if (!MONTHS.includes(month)) continue;

  const timeStr = String(r[2] || '');
  const tm = timeStr.match(/ (\d{2}):(\d{2}):(\d{2})$/);
  if (!tm) continue;
  const hour = parseInt(tm[1], 10);
  if (hour < 1 || hour >= 6) continue; // 01:00:00 ~ 05:59:59

  const product = String(r[11] || '').trim();
  if (!FUELS.includes(product)) continue;

  const vehicle = String(r[6] || '').trim() || '(차량없음)';
  const qty = Number(r[12]) || 0;
  const amount = Number(r[14]) || 0;
  if (qty > 0 && amount === 0) continue;

  const fifoPrice = getFifoPrice(dateStr, product);
  const profit = amount - qty * fifoPrice;

  const key = `${vehicle}||${product}`;
  if (!agg[key]) {
    agg[key] = {
      vehicle, fuel: product,
      months: Object.fromEntries(MONTHS.map(m => [m, { amount: 0, qty: 0, profit: 0 }])),
    };
  }
  const m = agg[key].months[month];
  m.amount += amount;
  m.qty += qty;
  m.profit += profit;
}

const rows = Object.values(agg).map(c => {
  let totalAmount = 0, totalQty = 0, totalProfit = 0;
  for (const m of MONTHS) {
    totalAmount += c.months[m].amount;
    totalQty += c.months[m].qty;
    totalProfit += c.months[m].profit;
  }
  return { ...c, totalAmount, totalQty, totalProfit };
}).sort((a, b) => b.totalAmount - a.totalAmount);

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TARGET_FILE);

  const existing = wb.getWorksheet(SHEET_NAME);
  if (existing) wb.removeWorksheet(existing.id);

  const ws = wb.addWorksheet(SHEET_NAME);

  const monthLabels = MONTHS.map(m => `${parseInt(m, 10)}월`);
  const header1 = ['차량번호', '유종'];
  const header2 = ['', ''];
  monthLabels.forEach(lbl => { header1.push(lbl, ''); header2.push('매출액', '영업이익'); });
  header1.push('총 주유금액', '총 주유L', '총 영업이익');
  header2.push('', '', '');

  ws.addRow(header1);
  ws.addRow(header2);

  monthLabels.forEach((_, i) => {
    const col = 3 + i * 2;
    ws.mergeCells(1, col, 1, col + 1);
  });
  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:B2');
  ws.mergeCells('O1:O2');
  ws.mergeCells('P1:P2');
  ws.mergeCells('Q1:Q2');

  const numFmt = '#,##0';
  const totals = { amount: 0, qty: 0, profit: 0, monthly: Object.fromEntries(MONTHS.map(m => [m, { amount: 0, profit: 0 }])) };

  for (const r of rows) {
    const rowVals = [r.vehicle, r.fuel];
    for (const m of MONTHS) {
      rowVals.push(Math.round(r.months[m].amount), Math.round(r.months[m].profit));
      totals.monthly[m].amount += r.months[m].amount;
      totals.monthly[m].profit += r.months[m].profit;
    }
    rowVals.push(Math.round(r.totalAmount), Math.round(r.totalQty * 100) / 100, Math.round(r.totalProfit));
    const row = ws.addRow(rowVals);
    row.eachCell((cell, colNumber) => { if (colNumber >= 3) cell.numFmt = numFmt; });
    totals.amount += r.totalAmount;
    totals.qty += r.totalQty;
    totals.profit += r.totalProfit;
  }

  const totalRowVals = ['합계', ''];
  for (const m of MONTHS) totalRowVals.push(Math.round(totals.monthly[m].amount), Math.round(totals.monthly[m].profit));
  totalRowVals.push(Math.round(totals.amount), Math.round(totals.qty * 100) / 100, Math.round(totals.profit));
  const totalRow = ws.addRow(totalRowVals);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell, colNumber) => { if (colNumber >= 3) cell.numFmt = numFmt; });

  [1, 2].forEach(rn => {
    const row = ws.getRow(rn);
    row.font = { bold: true };
    row.alignment = { vertical: 'middle', horizontal: 'center' };
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 8;
  for (let c = 3; c <= 17; c++) ws.getColumn(c).width = 13;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

  await wb.xlsx.writeFile(TARGET_FILE);
  console.log(`완료: "${SHEET_NAME}" 시트 생성 (${rows.length}개 차량·유종 행)`);
  console.log(`총 주유금액: ${Math.round(totals.amount).toLocaleString()}원`);
  console.log(`총 주유L: ${(Math.round(totals.qty*100)/100).toLocaleString()}L`);
  console.log(`총 영업이익: ${Math.round(totals.profit).toLocaleString()}원`);
})().catch(e => { console.error(e); process.exit(1); });
