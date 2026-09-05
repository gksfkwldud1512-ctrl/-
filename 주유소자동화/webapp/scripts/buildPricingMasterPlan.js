'use strict';
/**
 * 업체별 판매단가 마스터플랜 엑셀 생성
 *
 * 순이익이 계속 마이너스인 상황에서, "어느 업체 단가를 얼마나 올려야 목표 순이익에
 * 도달하는지"를 협상용 수치로 뽑아낸다.
 *
 * 매입단가/영업이익 계산은 server.js의 /api/summary 로직(getFifoPrice)과 동일하게 맞춘다.
 * 기준이 어긋나면 종합현황 탭 수치와 안 맞아 자료 신뢰를 잃기 때문.
 *
 * 실행: node scripts/buildPricingMasterPlan.js
 * 산출: output/업체별_판매단가_마스터플랜.xlsx
 */
const fs      = require('fs');
const path    = require('path');
const ExcelJS = require('exceljs');

const ROOT       = path.join(__dirname, '..');
const DATA_DIR   = path.join(ROOT, 'data');
const DAILY_DIR  = path.join(DATA_DIR, 'daily');
const OUTPUT_DIR = path.join(ROOT, 'output');

const FUELS       = ['휘발유', '경유', '등유'];
const TARGET_NET  = 1000000;   // 목표 월 순이익

// 단가 협상 자체가 불가능한 항목(뜨내기 현금손님/포인트 등) — 총계에는 포함하되
// "인상 대상" 목록에서는 제외한다. 실명 업체가 현금결제한 건은 협상 대상이므로 제외 안 함.
const NON_NEGOTIABLE = new Set(['현금고객', '대표현금고객', '포인트', '디지털쿠폰', 'BLU/Q멤버쉽']);

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const won  = v => Math.round(v);
const fix1 = v => Math.round(v * 10) / 10;

// ── 매입단가: server.js getFifoPrice와 동일 (fifo_daily 우선, purchase_prices fallback) ──
const prices    = readJSON(path.join(DATA_DIR, 'purchase_prices.json'), []);
const fifoDaily = readJSON(path.join(DATA_DIR, 'fifo_daily_prices.json'), []);
const fifoMap   = {};
for (const e of fifoDaily) if (!fifoMap[e.date]) fifoMap[e.date] = e;

function getFifoPrice(date, fuel) {
  const fe = fifoMap[date];
  if (fe && fe[fuel]?.price) return fe[fuel].price;
  const list = prices.filter(p => p.fuel === fuel && p.date <= date);
  return list.length ? list[list.length - 1].price : 0;
}

// 대상 월 자동 스캔 (customer_sales_YYYY_MM.json 존재하는 달만)
function monthList() {
  return fs.readdirSync(DATA_DIR)
    .filter(f => /^customer_sales_\d{4}_\d{2}\.json$/.test(f))
    .map(f => f.slice('customer_sales_'.length, -'.json'.length).replace('_', '-'))
    .sort();
}

// 월별 유종 가중평균 매입단가 + 서버와 동일한 영업이익/순이익 재현
function monthlyStats(ym) {
  const files = fs.existsSync(DAILY_DIR)
    ? fs.readdirSync(DAILY_DIR).filter(f => f.startsWith(ym) && f.endsWith('.json')) : [];

  const qty = {}, cost = {}, sales = {};
  FUELS.forEach(f => { qty[f] = 0; cost[f] = 0; sales[f] = 0; });
  let profit = 0, carwash = 0, others = 0, cardFee = 0;

  for (const f of files) {
    const d = readJSON(path.join(DAILY_DIR, f), {});
    if (!d.bos?.date) continue;
    for (const fuel of FUELS) {
      const fd = d.bos.fuels?.[fuel];
      if (!fd) continue;
      const bp = getFifoPrice(d.bos.date, fuel);
      qty[fuel]   += fd.qty || 0;
      sales[fuel] += fd.amount || 0;
      if (bp) { cost[fuel] += (fd.qty || 0) * bp; profit += (fd.amount || 0) - (fd.qty || 0) * bp; }
    }
    carwash += d.bos.carwash?.amount || 0;
    others  += d.bos.others?.amount  || 0;
    cardFee += d.card?.totalFee || 0;
    profit  += (d.bos.carwash?.amount || 0) + (d.bos.others?.amount || 0)
             - (d.otherCost || 0) - (d.card?.totalFee || 0);
  }

  const buyPrice = {};
  FUELS.forEach(f => { buyPrice[f] = qty[f] > 0 ? Math.round(cost[f] / qty[f]) : null; });

  const expense = readJSON(path.join(DATA_DIR, 'expenses.json'), [])
    .filter(e => e.month === ym).reduce((s, e) => s + (e.amount || 0), 0);

  return {
    ym, buyPrice, qty, sales, carwash, others, cardFee,
    revenue: FUELS.reduce((s, f) => s + sales[f], 0) + carwash + others,
    profit: won(profit), expense,
  };
}

// 오일뱅크 지원금 (server.js oilbankSupportForMonth와 동일 산식)
const PRICE_FUELS = FUELS;
function oilbankSupportForMonth(ym) {
  const lots = readJSON(path.join(DATA_DIR, 'purchase_lots.json'), []);
  return readJSON(path.join(DATA_DIR, 'oilbank_supports.json'), []).reduce((sum, s) => {
    const fuels = (Array.isArray(s.fuels) && s.fuels.length) ? s.fuels : PRICE_FUELS;
    const pick  = new Set(fuels);
    let start = s.from, end = s.to;
    if (start.slice(0, 7) < ym) start = `${ym}-01`;
    if (end.slice(0, 7)   > ym) end   = `${ym}-31`;
    if (start.slice(0, 7) > ym || end.slice(0, 7) < ym) return sum;
    let total = 0;
    lots.forEach(l => {
      if (l.type === 'stock' || l.stock || !((Number(l.qty) || 0) > 0)) return;
      if (!pick.has(l.fuel)) return;
      const dt = String(l.date || '');
      if (dt < start || dt > end) return;
      total += Number(l.qty) || 0;
    });
    return sum + Math.round(total * (Number(s.unitAmount) || 0));
  }, 0);
}

// ── 업체별 집계 ────────────────────────────────────────────────
function buildVendorData(months, statsByMonth) {
  const agg = new Map();   // name -> { name, payTypes:Set, qty, amt, cost, byMonth:{ym:{qty,amt,cost}} }

  months.forEach(ym => {
    const buy = statsByMonth[ym].buyPrice;
    const list = readJSON(path.join(DATA_DIR, `customer_sales_${ym.replace('-', '_')}.json`), []);
    list.forEach(c => {
      let q = 0, amt = 0, cost = 0;
      for (const [fuel, fd] of Object.entries(c.fuels || {})) {
        const bp = buy[fuel];
        if (!bp || !fd.qty) continue;
        q += fd.qty; amt += fd.amount; cost += fd.qty * bp;
      }
      if (q <= 0) return;
      if (!agg.has(c.name)) agg.set(c.name, { name: c.name, payTypes: new Set(), qty: 0, amt: 0, cost: 0, byMonth: {} });
      const a = agg.get(c.name);
      a.payTypes.add(c.payType);
      a.qty += q; a.amt += amt; a.cost += cost;
      const bm = a.byMonth[ym] || (a.byMonth[ym] = { qty: 0, amt: 0, cost: 0 });
      bm.qty += q; bm.amt += amt; bm.cost += cost;
    });
  });

  const n = months.length;
  return [...agg.values()].map(a => ({
    ...a,
    payType:   [...a.payTypes].join(','),
    margin:    (a.amt - a.cost) / a.qty,           // 원/L
    avgSell:   a.amt / a.qty,
    avgBuy:    a.cost / a.qty,
    mQty:      a.qty / n,                          // 월평균 물량
    mProfit:   (a.amt - a.cost) / n,               // 월평균 이익
    negotiable: !NON_NEGOTIABLE.has(a.name),
    taxFree:   /면세/.test(a.name),
  }));
}

// 최저마진 보장선 F: Σ max(0, F−마진)×월물량 = need  (이분탐색)
function solveFloor(rows, need) {
  const targets = rows.filter(r => r.negotiable);
  const gain = F => targets.reduce((s, r) => s + Math.max(0, F - r.margin) * r.mQty, 0);
  let lo = 0, hi = 1000;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (gain(mid) < need) lo = mid; else hi = mid; }
  const F = (lo + hi) / 2;
  return { floor: F, gain: gain(F) };
}

// ── 엑셀 서식 헬퍼 ─────────────────────────────────────────────
const T  = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const AB = { top: T, left: T, bottom: T, right: T };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const WARN_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDEBD0' } };
const GREY_FONT = { name: '맑은 고딕', size: 9, color: { argb: 'FF9AA0A6' } };
const F9        = { name: '맑은 고딕', size: 9 };
const F9B       = { name: '맑은 고딕', size: 9, bold: true };
const NUM = '#,##0';
const NUM1 = '#,##0.0';

function headerRow(ws, rowIdx, labels, widths) {
  const row = ws.getRow(rowIdx);
  labels.forEach((t, i) => {
    const c = row.getCell(i + 1);
    c.value = t; c.font = F9B; c.fill = HEAD_FILL; c.border = AB;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  row.height = 30;
  if (widths) widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: rowIdx }];
}

function putRow(ws, rowIdx, values, opts = {}) {
  const row = ws.getRow(rowIdx);
  values.forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v; c.border = AB;
    c.font = opts.font || F9;
    if (typeof v === 'number') {
      c.numFmt = (opts.fmts && opts.fmts[i]) || NUM;
      c.alignment = { horizontal: 'right' };
    } else {
      c.alignment = { horizontal: opts.leftCols?.includes(i) ? 'left' : 'center' };
    }
    if (opts.fills && opts.fills[i]) c.fill = opts.fills[i];
    if (opts.colors && opts.colors[i]) c.font = { ...(opts.font || F9), color: { argb: opts.colors[i] } };
  });
  return row;
}

// ── 메인 ───────────────────────────────────────────────────────
async function main() {
  const months = monthList();
  if (!months.length) throw new Error('customer_sales_*.json 파일이 없습니다.');

  const statsByMonth = {};
  months.forEach(ym => { statsByMonth[ym] = monthlyStats(ym); });
  months.forEach(ym => {
    const s = statsByMonth[ym];
    s.oilbank = oilbankSupportForMonth(ym);
    s.netProfit = won(s.profit - s.expense + s.oilbank);
  });

  const avgNet = months.reduce((s, ym) => s + statsByMonth[ym].netProfit, 0) / months.length;
  const need   = TARGET_NET - avgNet;

  const rows = buildVendorData(months, statsByMonth);
  const totalMQty = rows.reduce((s, r) => s + r.mQty, 0);
  const { floor, gain } = solveFloor(rows, need);

  const affected = rows.filter(r => r.negotiable && r.margin < floor)
    .map(r => ({ ...r, raise: floor - r.margin, addProfit: (floor - r.margin) * r.mQty }))
    .sort((a, b) => b.addProfit - a.addProfit);
  const keepAsIs = rows.filter(r => !(r.negotiable && r.margin < floor))
    .sort((a, b) => b.mQty - a.mQty);

  const wb = new ExcelJS.Workbook();
  wb.creator = '미소주유소 자동화';

  // ───── 시트1: 요약 ─────
  const s1 = wb.addWorksheet('요약');
  s1.getColumn(1).width = 22;
  [2, 3, 4, 5, 6].forEach(i => { s1.getColumn(i).width = 16; });
  s1.getCell('A1').value = '업체별 판매단가 마스터플랜';
  s1.getCell('A1').font = { name: '맑은 고딕', size: 16, bold: true };
  s1.getCell('A2').value = `분석기간: ${months[0]} ~ ${months[months.length - 1]} (${months.length}개월 평균 기준)`;
  s1.getCell('A2').font = GREY_FONT;

  let r = 4;
  s1.getCell(`A${r}`).value = '■ 월별 실적';
  s1.getCell(`A${r}`).font = F9B;
  r++;
  headerRow(s1, r, ['월', '매출', '영업이익', '지출', '오일뱅크지원금', '순이익'], [22, 16, 16, 16, 16, 16]);
  s1.views = [];
  r++;
  months.forEach(ym => {
    const s = statsByMonth[ym];
    putRow(s1, r, [ym, s.revenue, s.profit, s.expense, s.oilbank, s.netProfit], {
      leftCols: [0],
      colors: [null, null, null, null, null, s.netProfit < 0 ? 'FFC00000' : 'FF1F7A1F'],
    });
    r++;
  });
  putRow(s1, r, ['월평균', won(months.reduce((a, ym) => a + statsByMonth[ym].revenue, 0) / months.length),
    won(months.reduce((a, ym) => a + statsByMonth[ym].profit, 0) / months.length),
    won(months.reduce((a, ym) => a + statsByMonth[ym].expense, 0) / months.length),
    won(months.reduce((a, ym) => a + statsByMonth[ym].oilbank, 0) / months.length),
    won(avgNet)], { font: F9B, leftCols: [0], colors: [null, null, null, null, null, avgNet < 0 ? 'FFC00000' : 'FF1F7A1F'] });
  r += 3;

  s1.getCell(`A${r}`).value = '■ 목표 및 산출 결과';
  s1.getCell(`A${r}`).font = F9B;
  r++;
  const summaryPairs = [
    ['현재 월평균 순이익', won(avgNet)],
    ['목표 월 순이익', TARGET_NET],
    ['월 추가 필요 이익', won(need)],
    ['월평균 판매물량 (L)', won(totalMQty)],
    ['전 업체 일괄인상 시 (원/L)', fix1(need / totalMQty)],
    ['★ 최저마진 보장선 (원/L)', fix1(floor)],
    ['인상 대상 업체 수', affected.length],
    ['현행 유지 업체 수', keepAsIs.length],
    ['보장선 적용 시 확보이익', won(gain)],
  ];
  summaryPairs.forEach(([k, v], i) => {
    const isKey = k.startsWith('★');
    putRow(s1, r, [k, v], {
      leftCols: [0], font: isKey ? F9B : F9,
      fmts: [null, (k.includes('원/L')) ? NUM1 : NUM],
      fills: isKey ? [WARN_FILL, WARN_FILL] : null,
    });
    r++;
  });
  r++;
  s1.getCell(`A${r}`).value =
    '※ 매입단가는 종합현황 탭(영업이익)과 동일한 FIFO 기준으로 계산했습니다.';
  s1.getCell(`A${r}`).font = GREY_FONT;
  r++;
  s1.getCell(`A${r}`).value =
    '※ 현금고객·포인트 등 단가협상이 불가능한 항목은 인상 대상에서 제외했습니다(총계에는 포함).';
  s1.getCell(`A${r}`).font = GREY_FONT;

  // ───── 시트2: 업체별 마스터플랜 ─────
  const s2 = wb.addWorksheet('업체별_마스터플랜');
  headerRow(s2, 1,
    ['순위', '업체명', '결제구분', '월평균물량(L)', '평균판매가', '평균매입가',
     '현재마진(원/L)', '목표마진(원/L)', '인상폭(원/L)', '월 예상증가익', '누적기여율', '비고'],
    [6, 26, 12, 14, 12, 12, 14, 14, 13, 15, 11, 22]);

  let rr = 2, cum = 0;
  affected.forEach((v, i) => {
    cum += v.addProfit;
    const note = v.taxFree ? '면세 — 별도 확인 필요' : '';
    putRow(s2, rr, [
      i + 1, v.name, v.payType, won(v.mQty), won(v.avgSell), won(v.avgBuy),
      fix1(v.margin), fix1(floor), fix1(v.raise), won(v.addProfit), cum / gain, note,
    ], {
      leftCols: [1, 11],
      fmts: [NUM, null, null, NUM, NUM, NUM, NUM1, NUM1, NUM1, NUM, '0.0%', null],
      colors: [null, null, null, null, null, null, v.margin < 0 ? 'FFC00000' : 'FFD98000'],
      fills: v.taxFree ? Array(12).fill(WARN_FILL) : null,
    });
    rr++;
  });

  rr++;
  s2.getCell(`A${rr}`).value = '── 아래는 현행 유지 (목표마진 이상이거나 협상 불가 항목) ──';
  s2.getCell(`A${rr}`).font = GREY_FONT;
  rr++;
  keepAsIs.forEach(v => {
    putRow(s2, rr, [
      '', v.name, v.payType, won(v.mQty), won(v.avgSell), won(v.avgBuy),
      fix1(v.margin), '', '', 0, '', v.negotiable ? '현행 유지' : '협상 불가(현금/포인트 등)',
    ], {
      leftCols: [1, 11], font: GREY_FONT,
      fmts: [null, null, null, NUM, NUM, NUM, NUM1, null, null, NUM, null, null],
    });
    rr++;
  });

  // ───── 시트3: 업체별 월별상세 ─────
  const s3 = wb.addWorksheet('업체별_월별상세');
  // 2단 헤더: 월 블록마다 5개 컬럼
  const subCols = ['판매량(L)', '판매금액', '평균판매가', '매입가', '마진(원/L)'];
  const h1 = s3.getRow(1), h2 = s3.getRow(2);
  h1.getCell(1).value = '업체명'; h2.getCell(1).value = '';
  s3.mergeCells(1, 1, 2, 1);
  s3.getColumn(1).width = 26;
  months.forEach((ym, mi) => {
    const base = 2 + mi * subCols.length;
    s3.mergeCells(1, base, 1, base + subCols.length - 1);
    const hc = h1.getCell(base);
    hc.value = ym; hc.font = F9B; hc.fill = HEAD_FILL; hc.border = AB;
    hc.alignment = { horizontal: 'center' };
    subCols.forEach((sc, si) => {
      const c = h2.getCell(base + si);
      c.value = sc; c.font = F9B; c.fill = HEAD_FILL; c.border = AB;
      c.alignment = { horizontal: 'center', wrapText: true };
      s3.getColumn(base + si).width = 12;
    });
  });
  const hc0 = h1.getCell(1);
  hc0.font = F9B; hc0.fill = HEAD_FILL; hc0.border = AB;
  hc0.alignment = { horizontal: 'center', vertical: 'middle' };
  h2.getCell(1).border = AB; h2.getCell(1).fill = HEAD_FILL;
  h1.height = 20; h2.height = 26;
  s3.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  const detailRows = rows.slice().sort((a, b) => b.mQty - a.mQty);
  let dr = 3;
  detailRows.forEach(v => {
    const row = s3.getRow(dr);
    const nameCell = row.getCell(1);
    nameCell.value = v.name; nameCell.font = F9; nameCell.border = AB;
    nameCell.alignment = { horizontal: 'left' };
    months.forEach((ym, mi) => {
      const base = 2 + mi * subCols.length;
      const bm = v.byMonth[ym];
      const vals = bm
        ? [won(bm.qty), won(bm.amt), won(bm.amt / bm.qty), won(bm.cost / bm.qty), fix1((bm.amt - bm.cost) / bm.qty)]
        : ['-', '-', '-', '-', '-'];
      vals.forEach((val, vi) => {
        const c = row.getCell(base + vi);
        c.value = val; c.border = AB; c.font = F9;
        if (typeof val === 'number') {
          c.numFmt = vi === 4 ? NUM1 : NUM;
          c.alignment = { horizontal: 'right' };
          if (vi === 4) {
            const color = val < 0 ? 'FFC00000' : (val < floor ? 'FFD98000' : 'FF1F7A1F');
            c.font = { ...F9, color: { argb: color } };
          }
        } else {
          c.alignment = { horizontal: 'center' };
          c.font = GREY_FONT;
        }
      });
    });
    dr++;
  });

  // ───── 시트4: 매입단가 참고 ─────
  const s4 = wb.addWorksheet('매입단가_참고');
  headerRow(s4, 1, ['월', ...FUELS.map(f => `${f} (원/L)`), '총 판매물량(L)'], [14, 15, 15, 15, 18]);
  let pr = 2;
  months.forEach(ym => {
    const s = statsByMonth[ym];
    putRow(s4, pr, [ym, ...FUELS.map(f => s.buyPrice[f] ?? '-'),
      won(FUELS.reduce((a, f) => a + s.qty[f], 0))], { leftCols: [0] });
    pr++;
  });
  pr += 2;
  s4.getCell(`A${pr}`).value = '※ fifo_daily_prices.json 우선, 없으면 purchase_prices.json을 사용해';
  s4.getCell(`A${pr}`).font = GREY_FONT;
  pr++;
  s4.getCell(`A${pr}`).value = '   일별 FIFO 단가로 원가를 잡은 뒤, 월별 물량 가중평균한 값입니다.';
  s4.getCell(`A${pr}`).font = GREY_FONT;
  pr++;
  s4.getCell(`A${pr}`).value = '   (server.js /api/summary 영업이익 계산과 동일한 기준)';
  s4.getCell(`A${pr}`).font = GREY_FONT;

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, '업체별_판매단가_마스터플랜.xlsx');
  await wb.xlsx.writeFile(outPath);

  // 콘솔 요약 (검증용)
  console.log('생성 완료:', outPath);
  console.log('분석기간      :', months[0], '~', months[months.length - 1], `(${months.length}개월)`);
  console.log('월평균 순이익 :', won(avgNet).toLocaleString());
  console.log('추가 필요이익 :', won(need).toLocaleString());
  console.log('최저마진보장선:', fix1(floor), '원/L');
  console.log('인상대상/전체 :', affected.length, '/', rows.length);
  console.log('확보이익      :', won(gain).toLocaleString(), '(필요액 대비 차이', won(gain - need), ')');
  console.log('월평균물량합계:', won(totalMQty).toLocaleString(), 'L');
  console.log('\n[월별 검증용]');
  months.forEach(ym => {
    const s = statsByMonth[ym];
    console.log(' ', ym, 'profit=', s.profit, 'expense=', s.expense, 'oilbank=', s.oilbank, 'net=', s.netProfit);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
