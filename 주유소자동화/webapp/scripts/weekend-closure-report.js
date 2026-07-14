'use strict';
// 주말 심야 마감 영향분석 보고서 생성 (1회성 실행 스크립트)
// 실행: node scripts/weekend-closure-report.js
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const WEBAPP_DIR   = path.join(__dirname, '..');
const DATA_DIR      = path.join(WEBAPP_DIR, 'data');
const DAILY_DIR      = path.join(DATA_DIR, 'daily');
const SOURCE_XLSX    = path.join(WEBAPP_DIR, 'uploads', 'upload_1780538128675.xlsx');
const OUT_DIR        = path.join(WEBAPP_DIR, 'output', '분석보고서');
const OUT_FILE       = path.join(OUT_DIR, '주말심야마감_영향분석_2026년4-5월.xlsx');

const MONTHS = ['2026-04', '2026-05'];
const FUELS  = ['휘발유', '경유', '등유'];
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

function readJSON(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; }
}

// ── 1. 원본 BOS 판매전표 상세조회 파싱 ──────────────────────────
function parseTransactions() {
  const wb  = XLSX.readFile(SOURCE_XLSX);
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const rows = raw.slice(3).filter(r => r[1]);

  const seen = new Set();
  let dupCount = 0;
  const txs = [];
  for (const r of rows) {
    const date = String(r[1] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const timeStr  = String(r[2] || '').trim();          // "26-04-01 12:04:39"
    const timePart = (timeStr.split(' ')[1] || '00:00:00').trim();
    const customer = String(r[4] || '').trim() || '현금고객';
    const payType  = String(r[8] || '').trim();
    const product  = String(r[11] || '').trim();
    const qty      = Number(r[12]) || 0;
    const amount   = Number(r[14]) || 0;
    const outType  = String(r[15] || '').trim();

    if (qty > 0 && amount === 0) continue; // 무상공급 제외 (기존 파서와 동일 규칙)

    const key = `${date}|${timeStr}|${customer}|${product}|${qty}|${amount}`;
    if (seen.has(key)) { dupCount++; continue; }
    seen.add(key);

    txs.push({ date, time: timePart, customer, payType, product, qty, amount, outType });
  }
  return { txs, dupCount, totalRows: rows.length };
}

function timeToSeconds(hhmmss) {
  const [h, m, s] = hhmmss.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=일 ... 5=금 6=토
}

const SEC_22 = 22 * 3600;
const SEC_06 = 6 * 3600;

// 시나리오1: 금 22:00~토 06:00, 토 22:00~일 06:00
function inScenario1(tx) {
  const dow = dayOfWeek(tx.date);
  const sec = timeToSeconds(tx.time);
  if (dow === 5 && sec >= SEC_22) return true; // 금요일 밤
  if (dow === 6 && sec < SEC_06) return true;  // 토요일 새벽 (금요일 창의 연장)
  if (dow === 6 && sec >= SEC_22) return true; // 토요일 밤
  if (dow === 0 && sec < SEC_06) return true;  // 일요일 새벽 (토요일 창의 연장)
  return false;
}

// 시나리오2: 토 00:00~06:00, 일 00:00~06:00 (시나리오1의 부분집합)
function inScenario2(tx) {
  const dow = dayOfWeek(tx.date);
  const sec = timeToSeconds(tx.time);
  if (dow === 6 && sec < SEC_06) return true;
  if (dow === 0 && sec < SEC_06) return true;
  return false;
}

// ── 2. FIFO 매입단가 조회 (server.js getFifoPrice와 동일 로직) ──
function buildPriceLookup() {
  const fifoDaily = readJSON(path.join(DATA_DIR, 'fifo_daily_prices.json'), []);
  const fifoDailyMap = {};
  for (const e of fifoDaily) { if (!fifoDailyMap[e.date]) fifoDailyMap[e.date] = e; }
  const prices = readJSON(path.join(DATA_DIR, 'purchase_prices.json'), []);

  return function getPriceForDate(date, fuel) {
    const fe = fifoDailyMap[date];
    if (fe && fe[fuel]?.price) return fe[fuel].price;
    const list = prices.filter(p => p.fuel === fuel && p.date <= date);
    return list.length ? list[list.length - 1].price : 0;
  };
}

// ── 3. 시나리오 영향 계산 ───────────────────────────────────────
function computeScenarioImpact(txs, filterFn, getPriceForDate) {
  const monthly = {};
  for (const m of MONTHS) monthly[m] = { revenue: 0, cogs: 0, margin: 0, qtyByFuel: { 휘발유: 0, 경유: 0, 등유: 0 } };
  const dailyMap = {};
  const vendorMap = {};

  for (const tx of txs) {
    if (tx.outType === '배달') continue; // 배달(00:00:00 placeholder) 제외
    if (!filterFn(tx)) continue;
    const ym = tx.date.slice(0, 7);
    if (!MONTHS.includes(ym)) continue;

    let cost = 0;
    const isFuel = FUELS.includes(tx.product);
    if (isFuel) {
      const price = getPriceForDate(tx.date, tx.product);
      cost = tx.qty * price;
      monthly[ym].qtyByFuel[tx.product] += tx.qty;
    }
    const margin = tx.amount - cost; // 세차/유외상품은 원가 없이 매출액 그대로 마진 (기존 앱 로직과 동일)

    monthly[ym].revenue += tx.amount;
    monthly[ym].cogs    += cost;
    monthly[ym].margin  += margin;

    if (!dailyMap[tx.date]) {
      dailyMap[tx.date] = {
        date: tx.date, dow: dayOfWeek(tx.date),
        revenue: 0, cogs: 0, margin: 0, otherAmount: 0,
        qtyByFuel: { 휘발유: 0, 경유: 0, 등유: 0 },
        amtByFuel: { 휘발유: 0, 경유: 0, 등유: 0 },
      };
    }
    const dd = dailyMap[tx.date];
    dd.revenue += tx.amount; dd.cogs += cost; dd.margin += margin;
    if (isFuel) { dd.qtyByFuel[tx.product] += tx.qty; dd.amtByFuel[tx.product] += tx.amount; }
    else dd.otherAmount += tx.amount;

    if (!vendorMap[tx.customer]) vendorMap[tx.customer] = { name: tx.customer, qty: 0, amount: 0 };
    vendorMap[tx.customer].qty    += tx.qty;
    vendorMap[tx.customer].amount += tx.amount;
  }

  const total = { revenue: 0, cogs: 0, margin: 0 };
  for (const m of MONTHS) { total.revenue += monthly[m].revenue; total.cogs += monthly[m].cogs; total.margin += monthly[m].margin; }

  const dailyDetail  = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  const vendorTotals = Object.values(vendorMap).sort((a, b) => b.qty - a.qty);

  return { monthly, total, dailyDetail, vendorTotals };
}

// ── 4. baseline 월 영업이익/지출 (server.js /api/summary 로직 복제) ──
function computeBaselineMonth(ym, getPriceForDate) {
  const dailyFiles = fs.existsSync(DAILY_DIR)
    ? fs.readdirSync(DAILY_DIR).filter(f => f.startsWith(ym) && f.endsWith('.json'))
    : [];

  let totalSales = { 휘발유: 0, 경유: 0, 등유: 0, carwash: 0, others: 0 };
  let totalProfit = 0;

  for (const f of dailyFiles) {
    const d = readJSON(path.join(DAILY_DIR, f), {});
    if (!d.bos?.date) continue;
    const date = d.bos.date;
    for (const fuel of FUELS) {
      const fd = d.bos.fuels?.[fuel];
      if (!fd) continue;
      totalSales[fuel] += fd.amount || 0;
      const buyPrice = getPriceForDate(date, fuel);
      if (buyPrice) totalProfit += (fd.amount || 0) - (fd.qty || 0) * buyPrice;
    }
    totalSales.carwash += d.bos.carwash?.amount || 0;
    totalSales.others  += d.bos.others?.amount  || 0;
    const otC = d.otherCost || 0;
    totalProfit += (d.bos.carwash?.amount || 0);
    totalProfit += (d.bos.others?.amount  || 0) - otC;
    totalProfit -= d.card?.totalFee || 0;
  }

  const revenue = totalSales.휘발유 + totalSales.경유 + totalSales.등유 + totalSales.carwash + totalSales.others;

  const allExpenses = readJSON(path.join(DATA_DIR, 'expenses.json'), []);
  const expenses = allExpenses.filter(e => e.month === ym);
  const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const baeExpense = expenses.filter(e => (e.vendor || '').includes('배준용'))
    .reduce((s, e) => s + (e.amount || 0), 0);

  return { revenue, profit: totalProfit, totalExpense, baeExpense, netProfit: totalProfit - totalExpense };
}

// ── 5. Excel 생성 헬퍼 ─────────────────────────────────────────
const FILL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
const FILL_SUBHEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
const FONT_HEADER = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
const FONT_SUBHEAD = { name: '맑은 고딕', size: 10, bold: true };
const FONT_BODY = { name: '맑은 고딕', size: 10 };
const THIN = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const NUMFMT = '#,##0';

function styleHeaderRow(row) {
  row.eachCell(c => {
    c.font = FONT_HEADER;
    c.fill = FILL_HEADER;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = BORDER_ALL;
  });
}

function styleBodyRow(row, numericCols = []) {
  row.eachCell((c, colNum) => {
    c.font = FONT_BODY;
    c.border = BORDER_ALL;
    if (numericCols.includes(colNum)) { c.numFmt = NUMFMT; c.alignment = { horizontal: 'right' }; }
    else c.alignment = { horizontal: 'center' };
  });
}

function addTitle(ws, text, span) {
  ws.mergeCells(1, 1, 1, span);
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { name: '맑은 고딕', size: 13, bold: true };
  ws.getRow(1).height = 24;
}

// ── 메인 ────────────────────────────────────────────────────────
async function main() {
  console.log('BOS 원본 파싱 중...', SOURCE_XLSX);
  const { txs, dupCount, totalRows } = parseTransactions();
  console.log(`총 ${totalRows}행 파싱, 유효거래 ${txs.length}건, 중복제외 ${dupCount}건`);

  const getPriceForDate = buildPriceLookup();

  const scenario1 = computeScenarioImpact(txs, inScenario1, getPriceForDate);
  const scenario2 = computeScenarioImpact(txs, inScenario2, getPriceForDate);

  const baseline = {};
  for (const ym of MONTHS) baseline[ym] = computeBaselineMonth(ym, getPriceForDate);

  // 정합성 체크: 시나리오2는 시나리오1의 부분집합이어야 함
  for (const ym of MONTHS) {
    if (scenario2.monthly[ym].revenue > scenario1.monthly[ym].revenue + 1) {
      console.warn(`⚠ 정합성 경고: ${ym} 시나리오2 매출(${scenario2.monthly[ym].revenue})이 시나리오1(${scenario1.monthly[ym].revenue})보다 큼`);
    }
  }

  // 콘솔 요약 출력
  console.log('\n=== 월별 요약 ===');
  for (const ym of MONTHS) {
    const b = baseline[ym];
    console.log(`[${ym}] 기존 매출:${Math.round(b.revenue).toLocaleString()} 영업이익:${Math.round(b.profit).toLocaleString()} 지출:${Math.round(b.totalExpense).toLocaleString()} 순이익:${Math.round(b.netProfit).toLocaleString()}`);
    console.log(`       시나리오1 영향: 매출 -${Math.round(scenario1.monthly[ym].revenue).toLocaleString()} 영업이익 -${Math.round(scenario1.monthly[ym].margin).toLocaleString()}`);
    console.log(`       시나리오2 영향: 매출 -${Math.round(scenario2.monthly[ym].revenue).toLocaleString()} 영업이익 -${Math.round(scenario2.monthly[ym].margin).toLocaleString()}`);
    console.log(`       배준용 급여: ${Math.round(b.baeExpense).toLocaleString()}`);
  }

  // ── 워크북 구성 ──
  const wb = new ExcelJS.Workbook();
  wb.creator = '미소주유소 자동화';
  wb.created = new Date();

  buildSummarySheet(wb, baseline, scenario1, scenario2);
  buildScenarioDetailSheet(wb, '시나리오1_상세', '시나리오1 (금·토 22:00~06:00 마감)', scenario1);
  buildVendorSheet(wb, '시나리오1_TOP업체', scenario1);
  buildScenarioDetailSheet(wb, '시나리오2_상세', '시나리오2 (토·일 00:00~06:00 마감)', scenario2);
  buildVendorSheet(wb, '시나리오2_TOP업체', scenario2);
  buildPayrollSheet(wb, baseline);
  buildNotesSheet(wb, dupCount);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`\n저장 완료: ${OUT_FILE}`);
}

function buildSummarySheet(wb, baseline, s1, s2) {
  const ws = wb.addWorksheet('요약');
  ws.columns = [{ width: 14 }, ...Array(9).fill({ width: 15 })];
  addTitle(ws, '주말 심야 마감 영향분석 — 요약 (2026년 4~5월)', 10);

  const groupRow = ws.getRow(3);
  groupRow.getCell(1).value = '구분';
  ws.mergeCells(3, 2, 3, 4); groupRow.getCell(2).value = '기존(baseline)';
  ws.mergeCells(3, 5, 3, 7); groupRow.getCell(5).value = '시나리오1 (금·토 22~06시 마감 + 배준용 급여제외)';
  ws.mergeCells(3, 8, 3, 10); groupRow.getCell(8).value = '시나리오2 (토·일 00~06시 마감 + 배준용 급여제외)';
  styleHeaderRow(groupRow);

  const headRow = ws.getRow(4);
  const cols = ['구분', '4월', '5월', '합계', '4월', '5월', '합계', '4월', '5월', '합계'];
  cols.forEach((v, i) => headRow.getCell(i + 1).value = v);
  styleHeaderRow(headRow);

  function scn(ym, s, base) {
    const impact = s.monthly[ym];
    const revenue = base.revenue - impact.revenue;
    const cogs = null;
    const profit = base.profit - impact.margin;
    const adjExpense = base.totalExpense - base.baeExpense;
    const netProfit = profit - adjExpense;
    return { revenue, profit, expense: adjExpense, netProfit, impactRevenue: impact.revenue, impactMargin: impact.margin };
  }

  const rows = [
    ['매출액', ym => baseline[ym].revenue, ym => scn(ym, s1, baseline[ym]).revenue, ym => scn(ym, s2, baseline[ym]).revenue],
    ['영업이익', ym => baseline[ym].profit, ym => scn(ym, s1, baseline[ym]).profit, ym => scn(ym, s2, baseline[ym]).profit],
    ['지출', ym => baseline[ym].totalExpense, ym => scn(ym, s1, baseline[ym]).expense, ym => scn(ym, s2, baseline[ym]).expense],
    ['순이익', ym => baseline[ym].netProfit, ym => scn(ym, s1, baseline[ym]).netProfit, ym => scn(ym, s2, baseline[ym]).netProfit],
  ];

  let r = 5;
  for (const [label, baseFn, s1Fn, s2Fn] of rows) {
    const row = ws.getRow(r);
    row.getCell(1).value = label;
    const b4 = baseFn(MONTHS[0]), b5 = baseFn(MONTHS[1]);
    const a4 = s1Fn(MONTHS[0]), a5 = s1Fn(MONTHS[1]);
    const c4 = s2Fn(MONTHS[0]), c5 = s2Fn(MONTHS[1]);
    const vals = [b4, b5, b4 + b5, a4, a5, a4 + a5, c4, c5, c4 + c5];
    vals.forEach((v, i) => row.getCell(i + 2).value = Math.round(v));
    styleBodyRow(row, [2,3,4,5,6,7,8,9,10]);
    if (label === '순이익') row.eachCell(c => { c.font = { ...FONT_BODY, bold: true }; });
    r++;
  }

  // Δ순이익 (시나리오 - 기존)
  const deltaRow = ws.getRow(r);
  deltaRow.getCell(1).value = 'Δ순이익 (시나리오-기존)';
  const bTotal = baseline[MONTHS[0]].netProfit + baseline[MONTHS[1]].netProfit;
  const s1_4 = scn(MONTHS[0], s1, baseline[MONTHS[0]]).netProfit, s1_5 = scn(MONTHS[1], s1, baseline[MONTHS[1]]).netProfit;
  const s2_4 = scn(MONTHS[0], s2, baseline[MONTHS[0]]).netProfit, s2_5 = scn(MONTHS[1], s2, baseline[MONTHS[1]]).netProfit;
  deltaRow.getCell(2).value = null; deltaRow.getCell(3).value = null; deltaRow.getCell(4).value = null;
  deltaRow.getCell(5).value = Math.round(s1_4 - baseline[MONTHS[0]].netProfit);
  deltaRow.getCell(6).value = Math.round(s1_5 - baseline[MONTHS[1]].netProfit);
  deltaRow.getCell(7).value = Math.round((s1_4 + s1_5) - bTotal);
  deltaRow.getCell(8).value = Math.round(s2_4 - baseline[MONTHS[0]].netProfit);
  deltaRow.getCell(9).value = Math.round(s2_5 - baseline[MONTHS[1]].netProfit);
  deltaRow.getCell(10).value = Math.round((s2_4 + s2_5) - bTotal);
  styleBodyRow(deltaRow, [2,3,4,5,6,7,8,9,10]);
  deltaRow.eachCell(c => { c.font = { ...FONT_BODY, bold: true, color: { argb: 'FFC00000' } }; });

  ws.getRow(2).height = 6;
}

function buildScenarioDetailSheet(wb, sheetName, title, scenario) {
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [{ width: 12 }, { width: 6 }, ...Array(8).fill({ width: 12 }), { width: 12 }];
  addTitle(ws, title + ' — 마감시간대 거래 상세 (배달 제외)', 11);

  const headRow = ws.getRow(3);
  const cols = ['날짜', '요일', '휘발유(L)', '휘발유(원)', '경유(L)', '경유(원)', '등유(L)', '등유(원)', '기타(세차/유외)', '매출원가', '매출총이익'];
  cols.forEach((v, i) => headRow.getCell(i + 1).value = v);
  styleHeaderRow(headRow);

  let r = 4;
  let curMonth = null;
  let monthAgg = null;
  const monthTotals = [];

  function flushMonth() {
    if (!monthAgg) return;
    const row = ws.getRow(r);
    row.getCell(1).value = `${curMonth} 소계`;
    row.getCell(3).value = round2(monthAgg.qty.휘발유); row.getCell(4).value = Math.round(monthAgg.amt.휘발유);
    row.getCell(5).value = round2(monthAgg.qty.경유); row.getCell(6).value = Math.round(monthAgg.amt.경유);
    row.getCell(7).value = round2(monthAgg.qty.등유); row.getCell(8).value = Math.round(monthAgg.amt.등유);
    row.getCell(9).value = Math.round(monthAgg.other);
    row.getCell(10).value = Math.round(monthAgg.cogs);
    row.getCell(11).value = Math.round(monthAgg.margin);
    styleBodyRow(row, [3,4,5,6,7,8,9,10,11]);
    row.eachCell(c => { c.font = { ...FONT_BODY, bold: true }; c.fill = FILL_SUBHEAD; });
    monthTotals.push({ month: curMonth, ...monthAgg });
    r++;
  }

  for (const dd of scenario.dailyDetail) {
    const ym = dd.date.slice(0, 7);
    if (ym !== curMonth) {
      flushMonth();
      curMonth = ym;
      monthAgg = { qty: { 휘발유: 0, 경유: 0, 등유: 0 }, amt: { 휘발유: 0, 경유: 0, 등유: 0 }, other: 0, cogs: 0, margin: 0 };
    }
    const row = ws.getRow(r);
    row.getCell(1).value = dd.date;
    row.getCell(2).value = DOW_KO[dd.dow];
    row.getCell(3).value = round2(dd.qtyByFuel.휘발유); row.getCell(4).value = Math.round(dd.amtByFuel.휘발유);
    row.getCell(5).value = round2(dd.qtyByFuel.경유); row.getCell(6).value = Math.round(dd.amtByFuel.경유);
    row.getCell(7).value = round2(dd.qtyByFuel.등유); row.getCell(8).value = Math.round(dd.amtByFuel.등유);
    row.getCell(9).value = Math.round(dd.otherAmount);
    row.getCell(10).value = Math.round(dd.cogs);
    row.getCell(11).value = Math.round(dd.margin);
    styleBodyRow(row, [3,4,5,6,7,8,9,10,11]);

    for (const fuel of FUELS) { monthAgg.qty[fuel] += dd.qtyByFuel[fuel]; monthAgg.amt[fuel] += dd.amtByFuel[fuel]; }
    monthAgg.other += dd.otherAmount; monthAgg.cogs += dd.cogs; monthAgg.margin += dd.margin;
    r++;
  }
  flushMonth();

  // 전체 합계
  const totalRow = ws.getRow(r);
  totalRow.getCell(1).value = '전체 합계';
  const grand = { qty: { 휘발유: 0, 경유: 0, 등유: 0 }, amt: { 휘발유: 0, 경유: 0, 등유: 0 }, other: 0, cogs: 0, margin: 0 };
  for (const mt of monthTotals) {
    for (const fuel of FUELS) { grand.qty[fuel] += mt.qty[fuel]; grand.amt[fuel] += mt.amt[fuel]; }
    grand.other += mt.other; grand.cogs += mt.cogs; grand.margin += mt.margin;
  }
  totalRow.getCell(3).value = round2(grand.qty.휘발유); totalRow.getCell(4).value = Math.round(grand.amt.휘발유);
  totalRow.getCell(5).value = round2(grand.qty.경유); totalRow.getCell(6).value = Math.round(grand.amt.경유);
  totalRow.getCell(7).value = round2(grand.qty.등유); totalRow.getCell(8).value = Math.round(grand.amt.등유);
  totalRow.getCell(9).value = Math.round(grand.other);
  totalRow.getCell(10).value = Math.round(grand.cogs);
  totalRow.getCell(11).value = Math.round(grand.margin);
  styleBodyRow(totalRow, [3,4,5,6,7,8,9,10,11]);
  totalRow.eachCell(c => { c.font = { ...FONT_BODY, bold: true }; c.fill = FILL_HEADER; c.font = { ...c.font, color: { argb: 'FFFFFFFF' } }; });

  ws.getRow(2).height = 6;
}

function buildVendorSheet(wb, sheetName, scenario) {
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [{ width: 6 }, { width: 26 }, { width: 14 }, { width: 16 }];
  addTitle(ws, sheetName.replace('_', ' — ') + ' (4~5월 합계, 배달 제외, 판매량 기준 상위 15개)', 4);

  const headRow = ws.getRow(3);
  ['순위', '거래처명', '판매량(L)', '매출액(원)'].forEach((v, i) => headRow.getCell(i + 1).value = v);
  styleHeaderRow(headRow);

  const top = scenario.vendorTotals.slice(0, 15);
  let r = 4;
  top.forEach((v, i) => {
    const row = ws.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = v.name;
    row.getCell(3).value = round2(v.qty);
    row.getCell(4).value = Math.round(v.amount);
    styleBodyRow(row, [1, 3, 4]);
    row.getCell(2).alignment = { horizontal: 'left' };
    r++;
  });
  ws.getRow(2).height = 6;
}

function buildPayrollSheet(wb, baseline) {
  const ws = wb.addWorksheet('급여조정_배준용');
  ws.columns = [{ width: 14 }, { width: 18 }, { width: 18 }, { width: 20 }];
  addTitle(ws, '배준용 급여 제외 전후 지출 비교', 4);

  const headRow = ws.getRow(3);
  ['월', '배준용 급여(원)', '기존 총지출(원)', '조정 후 지출(원)'].forEach((v, i) => headRow.getCell(i + 1).value = v);
  styleHeaderRow(headRow);

  let r = 4;
  let sumBae = 0, sumBefore = 0, sumAfter = 0;
  for (const ym of MONTHS) {
    const b = baseline[ym];
    const row = ws.getRow(r);
    row.getCell(1).value = ym;
    row.getCell(2).value = Math.round(b.baeExpense);
    row.getCell(3).value = Math.round(b.totalExpense);
    row.getCell(4).value = Math.round(b.totalExpense - b.baeExpense);
    styleBodyRow(row, [2, 3, 4]);
    sumBae += b.baeExpense; sumBefore += b.totalExpense; sumAfter += (b.totalExpense - b.baeExpense);
    r++;
  }
  const totalRow = ws.getRow(r);
  totalRow.getCell(1).value = '합계';
  totalRow.getCell(2).value = Math.round(sumBae);
  totalRow.getCell(3).value = Math.round(sumBefore);
  totalRow.getCell(4).value = Math.round(sumAfter);
  styleBodyRow(totalRow, [2, 3, 4]);
  totalRow.eachCell(c => { c.font = { ...FONT_BODY, bold: true }; c.fill = FILL_SUBHEAD; });
}

function buildNotesSheet(wb, dupCount) {
  const ws = wb.addWorksheet('가정및주의사항');
  ws.columns = [{ width: 100 }];
  addTitle(ws, '가정 및 주의사항', 1);

  const notes = [
    '1. 데이터 출처: uploads/upload_1780538128675.xlsx (BOS 판매전표 상세조회, 2026-01-01~2026-06-04). 이 파일에만 거래별 실제 시각(주유시간)이 남아있어 사용함.',
    `   중복거래 감지: ${dupCount}건 (동일 날짜/시각/거래처/제품/수량/금액) — 계산에서 제외.`,
    '2. 배달 거래 제외 근거: BOS 입력 시 배달(출고형태="배달") 거래는 실제 배달시각이 아니라 "00:00:00"으로 일괄 입력됨. 이 플레이스홀더 시각을 실제 새벽시간 매출로 오인하지 않도록 두 시나리오 계산에서 전부 제외함.',
    '3. 시나리오1 = 금요일 22:00~토요일 06:00 + 토요일 22:00~일요일 06:00 마감 (일요일 밤은 정상영업 유지, 주 16시간).',
    '4. 시나리오2 = 토요일 00:00~06:00 + 일요일 00:00~06:00만 마감 (시나리오1의 부분집합, 주 12시간). 22:00~24:00는 정상영업.',
    '5. 매출원가는 해당 날짜의 FIFO 매입단가(fifo_daily_prices.json 우선, 없으면 purchase_prices.json 최신값)를 유종별 판매량에 곱해 계산. 기존 웹앱의 영업이익 계산 방식과 동일.',
    '6. 세차·유외상품(오일/워셔액/부동액 등)은 원가 데이터가 시간대별로 없어 매출액 전액을 마진으로 처리 (기존 웹앱 로직과 동일한 단순화).',
    '7. 카드수수료는 일 단위 총액으로만 존재하고 거래별 배분 근거가 없어, 마감시간대 영업이익 감소분 계산에는 반영하지 않음 (기존 월 baseline 영업이익에는 이미 포함되어 있음). 이 때문에 시나리오 영업이익 감소분은 순수 매출총이익(매출액-매입원가) 기준이며 카드수수료만큼 실제보다 약간 보수적(적게 줄어드는 방향)일 수 있음.',
    '8. 배준용 직원 급여는 "전액 제외" 가정 (근무시간별 급여 데이터가 없어 시간대 비례 계산 불가). 즉 이 직원이 완전히 퇴사한다고 가정한 조정치.',
    '9. baseline(기존) 월 영업이익/지출은 data/daily/*.json + data/expenses.json 기준으로 기존 웹앱(/api/summary) 공식을 그대로 복제해 계산함.',
  ];
  let r = 3;
  for (const n of notes) {
    const row = ws.getRow(r);
    row.getCell(1).value = n;
    row.getCell(1).font = FONT_BODY;
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    row.height = 30;
    r++;
  }
}

function round2(n) { return Math.round((n || 0) * 100) / 100; }

main().catch(e => { console.error(e); process.exit(1); });
