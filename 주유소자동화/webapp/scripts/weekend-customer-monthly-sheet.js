// "1월~6월 상세거래내역.xlsx"의 Sheet1(판매전표 상세조회 원본)에서 토요일·일요일 거래만 추출해
// 월별 시트(거래처별 정리)를 같은 파일에 추가한다.
// 실행: node scripts/weekend-customer-monthly-sheet.js
const path = require('path');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

const TARGET_FILE = path.join(__dirname, '..', '1월~6월 상세거래내역.xlsx');
const MONTHS = ['01', '02', '03', '04', '05', '06'];
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
const SUMMARY_SHEET = '토일_요약';

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

// ── 원본 거래내역 읽기 (판매전표 상세조회 포맷, Sheet1) ──
const rawWb = XLSX.readFile(TARGET_FILE);
const rawWs = rawWb.Sheets[rawWb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(rawWs, { header: 1 });
const dataRows = raw.slice(3).filter(r => r[1]);

const txsByMonth = Object.fromEntries(MONTHS.map(m => [m, []]));

for (const r of dataRows) {
  const date = String(r[1] || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
  const month = date.slice(5, 7);
  if (!MONTHS.includes(month)) continue;

  const dow = dayOfWeek(date);
  if (dow !== 0 && dow !== 6) continue; // 일요일=0, 토요일=6

  const timeStr = String(r[2] || '').trim();
  const time = (timeStr.split(' ')[1] || '00:00:00').trim();
  const customer = String(r[4] || '').trim() || '현금고객';
  const payType = String(r[8] || '').trim();
  const product = String(r[11] || '').trim();
  const qty = Number(r[12]) || 0;
  const unitPrice = Number(r[13]) || 0;
  const amount = Number(r[14]) || 0;

  if (qty > 0 && amount === 0) continue; // 무상공급 제외

  txsByMonth[month].push({ date, time, dow, customer, payType, product, qty, unitPrice, amount });
}

function round2(n) { return Math.round((n || 0) * 100) / 100; }

function computeMonthStats(txs) {
  const byCustomer = {};
  for (const tx of txs) {
    if (!byCustomer[tx.customer]) byCustomer[tx.customer] = { name: tx.customer, txs: [], qty: 0, amount: 0 };
    byCustomer[tx.customer].txs.push(tx);
    byCustomer[tx.customer].qty += tx.qty;
    byCustomer[tx.customer].amount += tx.amount;
  }
  const customers = Object.values(byCustomer).sort((a, b) => b.amount - a.amount);
  const qty = customers.reduce((s, c) => s + c.qty, 0);
  const amount = customers.reduce((s, c) => s + c.amount, 0);
  return { customers, customerCount: customers.length, qty, amount, txCount: txs.length };
}

const monthStats = {};
for (const m of MONTHS) monthStats[m] = computeMonthStats(txsByMonth[m]);

// ── exceljs로 기존 파일에 시트 추가 ──
const FILL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
const FILL_SUBTOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
const FILL_TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
const THIN = { style: 'thin' };
const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const NUMFMT = '#,##0';

function styleHeaderRow(row) {
  row.font = { bold: true };
  row.eachCell(c => {
    c.fill = FILL_HEADER;
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = BORDER_ALL;
  });
}

function styleBodyRow(row, numericCols = []) {
  row.eachCell((c, colNumber) => {
    c.border = BORDER_ALL;
    if (numericCols.includes(colNumber)) { c.numFmt = NUMFMT; c.alignment = { horizontal: 'right' }; }
    else c.alignment = { horizontal: 'center' };
  });
}

function buildMonthSheet(wb, month, stats) {
  const sheetName = `토일_${parseInt(month, 10)}월`;
  const existing = wb.getWorksheet(sheetName);
  if (existing) wb.removeWorksheet(existing.id);

  const ws = wb.addWorksheet(sheetName);
  ws.columns = [
    { width: 12 }, { width: 6 }, { width: 24 }, { width: 10 },
    { width: 10 }, { width: 12 }, { width: 12 }, { width: 14 },
  ];

  const headRow = ws.addRow(['날짜', '요일', '거래처명', '결제구분', '품목', '수량', '단가', '금액']);
  styleHeaderRow(headRow);
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const cust of stats.customers) {
    const sortedTxs = cust.txs.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    for (const tx of sortedTxs) {
      const row = ws.addRow([
        tx.date, DOW_KO[tx.dow], tx.customer, tx.payType, tx.product,
        round2(tx.qty), Math.round(tx.unitPrice), Math.round(tx.amount),
      ]);
      styleBodyRow(row, [6, 7, 8]);
      row.getCell(3).alignment = { horizontal: 'left' };
    }
    const subRow = ws.addRow([`${cust.name} 소계`, '', '', '', '', round2(cust.qty), '', Math.round(cust.amount)]);
    ws.mergeCells(subRow.number, 1, subRow.number, 5);
    styleBodyRow(subRow, [6, 7, 8]);
    subRow.eachCell(c => { c.font = { bold: true }; c.fill = FILL_SUBTOTAL; });
  }

  const totalRow = ws.addRow([`${parseInt(month, 10)}월 토·일요일 합계`, '', '', '', '', round2(stats.qty), '', Math.round(stats.amount)]);
  ws.mergeCells(totalRow.number, 1, totalRow.number, 5);
  styleBodyRow(totalRow, [6, 7, 8]);
  totalRow.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = FILL_TOTAL; });

  return sheetName;
}

function buildSummarySheet(wb) {
  const existing = wb.getWorksheet(SUMMARY_SHEET);
  if (existing) wb.removeWorksheet(existing.id);

  const ws = wb.addWorksheet(SUMMARY_SHEET);
  ws.columns = [{ width: 8 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 16 }];
  const headRow = ws.addRow(['월', '거래처 수', '거래건수', '판매량(L)', '매출액(원)']);
  styleHeaderRow(headRow);

  let totTx = 0, totQty = 0, totAmt = 0;
  for (const m of MONTHS) {
    const s = monthStats[m];
    const row = ws.addRow([`${parseInt(m, 10)}월`, s.customerCount, s.txCount, round2(s.qty), Math.round(s.amount)]);
    styleBodyRow(row, [2, 3, 4, 5]);
    totTx += s.txCount; totQty += s.qty; totAmt += s.amount;
  }
  const totalRow = ws.addRow(['합계', '', totTx, round2(totQty), Math.round(totAmt)]);
  styleBodyRow(totalRow, [2, 3, 4, 5]);
  totalRow.eachCell(c => { c.font = { bold: true }; c.fill = FILL_SUBTOTAL; });
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TARGET_FILE);

  buildSummarySheet(wb);
  for (const m of MONTHS) {
    const name = buildMonthSheet(wb, m, monthStats[m]);
    const s = monthStats[m];
    console.log(`"${name}" 시트 생성: 거래처 ${s.customerCount}곳 / 거래 ${s.txCount}건 / 매출 ${Math.round(s.amount).toLocaleString()}원`);
  }

  await wb.xlsx.writeFile(TARGET_FILE);
  console.log(`\n완료: "${TARGET_FILE}"에 토·일요일 월별 시트 7개 추가 (요약 1 + 1~6월)`);
})().catch(e => { console.error(e); process.exit(1); });
