// 입고(purchase_lots) × 판매(daily BOS) 선입선출(FIFO) 월별 분석 보고서 생성
// 사용: node scripts/fifo-report/build.js [출력경로.xlsx]
// 앱의 recomputeFifoPrices()와 같은 규칙: stock 스냅샷 제외, 입고 lot을 날짜순으로 소진,
// 재고가 바닥난 상태의 판매분(입고 등록 누락 의심)은 다음 입고 lot이 들어오면 그 lot에서 충당.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const DATA = path.join(__dirname, '..', '..', 'data');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', 'output', '2026_입고판매_FIFO분석.xlsx');
const FUELS = ['경유', '휘발유', '등유'];
const OPENING_DATE = '2026-01-01';   // 이 날짜의 lot은 기초재고로 취급
const FONT = '맑은 고딕';

const readJSON = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

// ── 원자료 ─────────────────────────────────────────────
const allLots = readJSON('purchase_lots.json');
const snapshots = allLots.filter(l => l.type === 'stock' || l.stock != null);
const lotsRaw = allLots.filter(l => l.qty > 0 && l.type !== 'stock' && !l.stock);
const tankActuals = readJSON('tank_actuals.json');

const days = fs.readdirSync(path.join(DATA, 'daily')).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  .map(f => readJSON(path.join('daily', f)))
  .filter(d => d.bos?.date && d.bos?.fuels)
  .map(d => ({ date: d.bos.date, fuels: d.bos.fuels }));
const dates = days.map(d => d.date);
const FIRST = dates[0], LAST = dates[dates.length - 1];
const months = [...new Set(dates.map(d => d.slice(0, 7)))];

// ── FIFO 엔진 ─────────────────────────────────────────
function runFifo(fuel) {
  const lots = lotsRaw.filter(l => l.fuel === fuel).map((l, i) => ({ ...l, rem: l.qty, chunks: [] }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const chunks = [];     // {lot, date, qty, rev, cost, repl, borrowed}
  const daily = [];      // {date, in, sold, price}
  let arrived = 0, ptr = 0, lastPrice = null;
  let deficits = [];     // 재고 없이 팔린 분량 {date, qty, unitRev, replP}

  const take = (lot, date, qty, unitRev, replP, borrowed) => {
    const c = { lot, date, qty, rev: qty * unitRev, cost: qty * lot.price, repl: qty * replP, borrowed };
    lot.rem -= qty; lot.chunks.push(c); chunks.push(c);
    if (lot.rem <= 1e-6) { lot.rem = 0; lot.soldOut = date > (lot.soldOut || '') ? date : lot.soldOut; }
  };

  for (const d of days) {
    let inQty = 0;
    while (arrived < lots.length && lots[arrived].date <= d.date) {
      const lot = lots[arrived++];
      inQty += lot.qty; lastPrice = lot.price;
      while (deficits.length && lot.rem > 1e-6) {
        const df = deficits[0];
        const q = Math.min(df.qty, lot.rem);
        take(lot, df.date, q, df.unitRev, df.replP, true);
        df.qty -= q; if (df.qty <= 1e-6) deficits.shift();
      }
    }
    const f = d.fuels[fuel] || {};
    let q = f.qty || 0;
    const unitRev = q > 0 ? (f.amount || 0) / q : 0;
    let curPrice = null;
    while (q > 1e-9 && ptr < arrived) {
      const lot = lots[ptr];
      if (lot.rem <= 1e-6) { ptr++; continue; }
      const t = Math.min(q, lot.rem);
      take(lot, d.date, t, unitRev, lastPrice, false);
      curPrice = lot.price; q -= t;
    }
    if (q > 1e-9) deficits.push({ date: d.date, qty: q, unitRev, replP: lastPrice });
    while (ptr < arrived && lots[ptr].rem <= 1e-6) ptr++;
    daily.push({ date: d.date, in: inQty, sold: f.qty || 0, amount: f.amount || 0,
      price: curPrice ?? (ptr < arrived ? lots[ptr].price : lastPrice) });
  }
  // 끝까지 충당되지 않은 판매분 → 가상 lot(입고 미등록 추정), 마지막 입고단가로 평가
  let ghost = null;
  if (deficits.length) {
    ghost = { date: deficits[0].date, fuel, qty: 0, price: lastPrice, rem: 0, chunks: [], ghost: true };
    for (const df of deficits) {
      ghost.qty += df.qty;
      const c = { lot: ghost, date: df.date, qty: df.qty, rev: df.qty * df.unitRev, cost: df.qty * lastPrice, repl: df.qty * df.replP, borrowed: true };
      ghost.chunks.push(c); chunks.push(c);
    }
  }
  return { fuel, lots, ghost, chunks, daily };
}
const R = Object.fromEntries(FUELS.map(f => [f, runFifo(f)]));

// ── 월별 집계 ─────────────────────────────────────────
const monthly = [];
for (const m of months) for (const fuel of FUELS) {
  const r = R[fuel];
  const mlots = r.lots.filter(l => l.date.slice(0, 7) === m && l.date !== OPENING_DATE);
  const ch = r.chunks.filter(c => c.date.slice(0, 7) === m);
  const dd = r.daily.filter(x => x.date.slice(0, 7) === m);
  monthly.push({
    m, fuel,
    inQty: mlots.reduce((s, l) => s + l.qty, 0),
    inAmt: mlots.reduce((s, l) => s + l.qty * l.price, 0),
    sold: dd.reduce((s, x) => s + x.sold, 0),
    rev: dd.reduce((s, x) => s + x.amount, 0),
    cost: ch.reduce((s, c) => s + c.cost, 0),
    repl: ch.reduce((s, c) => s + c.repl, 0),
    days: dd.length,
  });
}
const opening = Object.fromEntries(FUELS.map(f => {
  const ls = R[f].lots.filter(l => l.date === OPENING_DATE);
  return [f, { qty: ls.reduce((s, l) => s + l.qty, 0), amt: ls.reduce((s, l) => s + l.qty * l.price, 0) }];
}));

// ── 엑셀 ──────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
wb.creator = '미소주유소 자동화';
wb.calcProperties.fullCalcOnLoad = true;

const C = { navy: 'FF1F3864', head: 'FF2F5597', sub: 'FFD9E2F3', blue: 'FF0000FF', green: 'FF008000', gray: 'FF808080',
  warn: 'FFFCE4D6', ok: 'FFE2EFDA', line: 'FFBFBFBF', zebra: 'FFF7F9FC' };
const NUM = '#,##0;[Red]-#,##0;"-"';
const NUM1 = '#,##0.0;[Red]-#,##0.0;"-"';
const PCT = '0.0%;[Red]-0.0%;"-"';
const DATE = 'yyyy-mm-dd';
const border = { top: { style: 'thin', color: { argb: C.line } }, bottom: { style: 'thin', color: { argb: C.line } },
  left: { style: 'thin', color: { argb: C.line } }, right: { style: 'thin', color: { argb: C.line } } };
const toDate = s => new Date(s + 'T00:00:00Z');
const F = (formula, result) => ({ formula, result });

function header(ws, row, labels, widths) {
  const r = ws.getRow(row);
  labels.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.head } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = border;
  });
  r.height = 34;
  if (widths) widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}
function styleCell(c, { fmt, input, bold, fill, color, align } = {}) {
  c.font = { name: FONT, size: 10, bold: !!bold, color: { argb: color || (input ? C.blue : 'FF000000') } };
  if (fmt) c.numFmt = fmt;
  if (fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  if (align) c.alignment = { horizontal: align, vertical: 'middle' };
  c.border = border;
}
function title(ws, text, sub) {
  ws.getCell('A1').value = text;
  ws.getCell('A1').font = { name: FONT, size: 15, bold: true, color: { argb: C.navy } };
  if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = { name: FONT, size: 9, color: { argb: C.gray } }; }
}

// ════ 시트: 월별분석 ════
const wsM = wb.addWorksheet('월별분석', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] });
title(wsM, '월별 입고·판매·선입선출 손익', `기간 ${FIRST} ~ ${LAST}  |  파란 글씨 = 원자료/FIFO 계산값, 검정 = 엑셀 수식`);
const mHead = ['월', '유종', '기초재고\n(L)', '기초재고\n금액', '입고량\n(L)', '입고금액', '평균\n입고단가', '판매량\n(L)', '매출액',
  '평균\n판매단가', 'FIFO\n매출원가', '매출총이익', 'L당\n마진', '최근입고가\n기준 원가', '선입선출\n재고효과', '기말재고\n(L)', '기말재고\n금액',
  '입고대비\n판매율', '집계\n일수', '재고\n보유일수'];
header(wsM, 4, mHead, [9, 7, 11, 14, 11, 15, 9, 11, 15, 9, 15, 14, 8, 15, 13, 11, 14, 9, 6, 8]);
const M0 = 5;
monthly.forEach((x, i) => {
  const r = M0 + i, row = wsM.getRow(r);
  const prev = i >= FUELS.length ? r - FUELS.length : null;
  const openQ = prev ? null : opening[x.fuel].qty, openA = prev ? null : opening[x.fuel].amt;
  // 캐시값(파이썬 없이 계산 결과도 같이 기록)
  const pm = prev ? monthly[i - FUELS.length] : null;
  x.openQ = pm ? pm.endQ : openQ; x.openA = pm ? pm.endA : openA;
  x.endQ = x.openQ + x.inQty - x.sold; x.endA = x.openA + x.inAmt - x.cost;
  const vals = [
    x.m, x.fuel,
    prev ? F(`P${prev}`, x.openQ) : openQ,
    prev ? F(`Q${prev}`, x.openA) : openA,
    x.inQty, x.inAmt,
    F(`IFERROR(F${r}/E${r},0)`, x.inQty ? x.inAmt / x.inQty : 0),
    x.sold, x.rev,
    F(`IFERROR(I${r}/H${r},0)`, x.sold ? x.rev / x.sold : 0),
    x.cost,
    F(`I${r}-K${r}`, x.rev - x.cost),
    F(`IFERROR(L${r}/H${r},0)`, x.sold ? (x.rev - x.cost) / x.sold : 0),
    x.repl,
    F(`N${r}-K${r}`, x.repl - x.cost),
    F(`C${r}+E${r}-H${r}`, x.endQ),
    F(`D${r}+F${r}-K${r}`, x.endA),
    F(`IFERROR(H${r}/E${r},0)`, x.inQty ? x.sold / x.inQty : 0),
    x.days,
    F(`IFERROR(P${r}/(H${r}/S${r}),0)`, x.sold ? x.endQ / (x.sold / x.days) : 0),
  ];
  const fmts = [null, null, NUM, NUM, NUM, NUM, NUM, NUM, NUM, NUM, NUM, NUM, NUM1, NUM, NUM, NUM, NUM, PCT, NUM, NUM1];
  const inputCols = new Set([5, 6, 8, 9, 11, 14, 19]);
  vals.forEach((v, j) => {
    const c = row.getCell(j + 1); c.value = v;
    styleCell(c, { fmt: fmts[j], input: inputCols.has(j + 1) || (!prev && (j === 2 || j === 3)),
      fill: (Math.floor(i / FUELS.length) % 2) ? C.zebra : null, align: j < 2 ? 'center' : null, bold: j === 11 });
  });
});
const mLast = M0 + monthly.length - 1;
wsM.getCell(`A${mLast + 2}`).value = '※ 기초재고: 1월은 1/1 lot(기초재고), 이후 월은 전월 기말재고. 기말재고금액 = 기초금액 + 입고금액 − FIFO 매출원가.';
wsM.getCell(`A${mLast + 3}`).value = '※ 선입선출 재고효과 = (판매일 기준 최근 입고단가로 원가를 잡았을 때) − (FIFO 원가). (+)면 싸게 사둔 재고 덕에 이득, (−)면 비싸게 사둔 재고 때문에 손해.';
wsM.getCell(`A${mLast + 4}`).value = `※ 10월은 ${LAST}까지 집계(부분월). 재고보유일수 = 기말재고 ÷ 일평균 판매량.`;
[2, 3, 4].forEach(k => { wsM.getCell(`A${mLast + k}`).font = { name: FONT, size: 9, color: { argb: C.gray } }; });
wsM.addConditionalFormatting({ ref: `L${M0}:L${mLast}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF63BE7B' }, gradient: false }] });
wsM.addConditionalFormatting({ ref: `O${M0}:O${mLast}`, rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'num', value: 0 }, { type: 'max' }],
  color: [{ argb: 'FFF8696B' }, { argb: 'FFFFFFFF' }, { argb: 'FF63BE7B' }] }] });
wsM.addConditionalFormatting({ ref: `P${M0}:P${mLast}`, rules: [{ type: 'cellIs', operator: 'lessThan', formulae: ['0'],
  style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' }, bold: true } } }] });

// ════ 시트: 입고별소진 ════
const wsL = wb.addWorksheet('입고별소진', { views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }] });
title(wsL, '입고 건별 소진 현황 (선입선출)', '소진율 막대 = 입고량 중 판매된 비율  |  월별 소진량 칸은 진할수록 그 달에 많이 팔림');
const monthLabels = months.map(m => `${+m.slice(5)}월`);
const lHead = ['No', '유종', '입고일', '입고량\n(L)', '입고단가', '입고금액', '판매(소진)\n량', '잔량\n(L)', '소진율', '상태',
  '판매\n시작일', '완판일', '완판까지\n일수', '배정\n매출액', '매출원가', 'FIFO 손익', 'L당\n손익', '평균\n판매가', ...monthLabels, '비고'];
header(wsL, 4, lHead, [5, 7, 11, 10, 8, 14, 11, 10, 14, 8, 11, 11, 8, 14, 14, 13, 8, 8, ...months.map(() => 8.5), 34]);
const L0 = 5;
const lotRows = [];
for (const fuel of FUELS) {
  const r = R[fuel];
  for (const lot of r.ghost ? [...r.lots, r.ghost] : r.lots) lotRows.push(lot);
}
const mc0 = 19; // 월별 소진량 첫 열(S)
const colL = n => wsL.getColumn(n).letter;
const mcFirst = colL(mc0), mcLast = colL(mc0 + months.length - 1);
lotRows.forEach((lot, i) => {
  const r = L0 + i, row = wsL.getRow(r);
  const sold = lot.chunks.reduce((s, c) => s + c.qty, 0);
  const rev = lot.chunks.reduce((s, c) => s + c.rev, 0);
  const first = lot.chunks.length ? lot.chunks.map(c => c.date).sort()[0] : null;
  const soldOut = lot.ghost ? null : (lot.rem === 0 ? lot.soldOut : null);
  const borrowed = lot.chunks.filter(c => c.borrowed).reduce((s, c) => s + c.qty, 0);
  const notes = [];
  if (lot.date === OPENING_DATE) notes.push('기초재고(1/1)');
  if (lot.ghost) notes.push(`⚠ 입고 미등록 추정: 재고 없이 판매된 ${Math.round(lot.qty).toLocaleString()}L (마지막 입고단가로 평가)`);
  else if (borrowed > 0.5) notes.push(`⚠ 입고 전 판매분 ${Math.round(borrowed).toLocaleString()}L 충당 (앞 lot 부족)`);
  const byMonth = months.map(m => lot.chunks.filter(c => c.date.slice(0, 7) === m).reduce((s, c) => s + c.qty, 0));
  const status = lot.ghost ? '미등록' : (lot.rem === 0 ? '완판' : (sold > 0 ? '판매중' : '미판매'));
  const vals = [
    i + 1, lot.fuel, toDate(lot.date), lot.qty, lot.price,
    F(`D${r}*E${r}`, lot.qty * lot.price),
    F(`SUM(${mcFirst}${r}:${mcLast}${r})`, sold),
    F(`D${r}-G${r}`, lot.qty - sold),
    F(`IFERROR(G${r}/D${r},0)`, lot.qty ? sold / lot.qty : 0),
    lot.ghost ? '미등록' : F(`IF(H${r}<=0.5,"완판",IF(G${r}=0,"미판매","판매중"))`, status),
    first ? toDate(first) : null,
    soldOut ? toDate(soldOut) : null,
    soldOut ? F(`L${r}-C${r}`, (toDate(soldOut) - toDate(lot.date)) / 864e5) : null,
    rev,
    F(`G${r}*E${r}`, sold * lot.price),
    F(`N${r}-O${r}`, rev - sold * lot.price),
    F(`IFERROR(P${r}/G${r},0)`, sold ? (rev - sold * lot.price) / sold : 0),
    F(`IFERROR(N${r}/G${r},0)`, sold ? rev / sold : 0),
    ...byMonth.map(v => v || null),
    notes.join(' / '),
  ];
  const fmts = [null, null, DATE, NUM, NUM, NUM, NUM, NUM, PCT, null, DATE, DATE, NUM, NUM, NUM, NUM, NUM1, NUM, ...months.map(() => NUM), null];
  const inputs = new Set([3, 4, 5, 11, 12, 14, ...months.map((_, k) => mc0 + k)]);
  vals.forEach((v, j) => {
    const c = row.getCell(j + 1); c.value = v;
    styleCell(c, { fmt: fmts[j], input: inputs.has(j + 1), align: [0, 1, 9].includes(j) ? 'center' : null,
      fill: lot.ghost ? C.warn : null, bold: j === 15 });
  });
});
const lLast = L0 + lotRows.length - 1;
wsL.autoFilter = { from: { row: 4, column: 1 }, to: { row: lLast, column: lHead.length } };
wsL.addConditionalFormatting({ ref: `I${L0}:I${lLast}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }],
  color: { argb: 'FF5B9BD5' }, gradient: false }] });
wsL.addConditionalFormatting({ ref: `${mcFirst}${L0}:${mcLast}${lLast}`, rules: [{ type: 'colorScale', cfvo: [{ type: 'num', value: 0 }, { type: 'max' }],
  color: [{ argb: 'FFFFFFFF' }, { argb: 'FFF4B183' }] }] });
wsL.addConditionalFormatting({ ref: `J${L0}:J${lLast}`, rules: [
  { type: 'containsText', operator: 'containsText', text: '완판', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.ok } } } },
  { type: 'containsText', operator: 'containsText', text: '판매중', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } } } },
  { type: 'containsText', operator: 'containsText', text: '미', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } } },
] });
wsL.addConditionalFormatting({ ref: `P${L0}:P${lLast}`, rules: [{ type: 'cellIs', operator: 'lessThan', formulae: ['0'],
  style: { font: { color: { argb: 'FFC00000' } } } }] });

// ════ 시트: 일별재고 ════
const wsD = wb.addWorksheet('일별재고', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
const dSub = ['입고', '판매', '장부재고', 'FIFO단가', 'ATG실재고'];
const g = wsD.getRow(1), h = wsD.getRow(2);
g.getCell(1).value = '날짜';
wsD.mergeCells(1, 1, 2, 1);
FUELS.forEach((fuel, k) => {
  const c0 = 2 + k * 5;
  wsD.mergeCells(1, c0, 1, c0 + 4);
  g.getCell(c0).value = fuel;
  dSub.forEach((s, j) => { h.getCell(c0 + j).value = s; });
});
[g, h].forEach(r => { for (let i = 1; i <= 16; i++) { const c = r.getCell(i);
  c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 1 || r === g ? C.navy : C.head } };
  c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = border; } });
wsD.getColumn(1).width = 11;
for (let i = 2; i <= 16; i++) wsD.getColumn(i).width = 10;
const atgMap = Object.fromEntries(tankActuals.map(t => [t.date, t]));
const D0 = 3;
const dIdx = {};
dates.forEach((date, i) => {
  const r = D0 + i, row = wsD.getRow(r);
  dIdx[date] = r;
  row.getCell(1).value = toDate(date); styleCell(row.getCell(1), { fmt: DATE, align: 'center' });
  FUELS.forEach((fuel, k) => {
    const dd = R[fuel].daily[i], c0 = 2 + k * 5;
    const L = n => wsD.getColumn(c0 + n).letter;
    dd.book = (i ? R[fuel].daily[i - 1].book : 0) + dd.in - dd.sold;
    const atg = atgMap[date]?.[fuel];
    const v = [dd.in || null, dd.sold,
      F(i ? `${L(2)}${r - 1}+${L(0)}${r}-${L(1)}${r}` : `${L(0)}${r}-${L(1)}${r}`, dd.book),
      dd.price, atg > 0 ? atg : null];
    v.forEach((x, j) => { const c = row.getCell(c0 + j); c.value = x;
      styleCell(c, { fmt: NUM, input: j !== 2, bold: j === 2, fill: j === 2 ? C.sub : null }); });
  });
});
const dLast = D0 + dates.length - 1;
FUELS.forEach((_, k) => {
  const col = wsD.getColumn(2 + k * 5 + 2).letter;
  wsD.addConditionalFormatting({ ref: `${col}${D0}:${col}${dLast}`, rules: [
    { type: 'cellIs', operator: 'lessThan', formulae: ['0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } } },
    { type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: 'FF8FAADC' }, gradient: false }] });
});

// ════ 시트: 실재고대조 ════
const wsT = wb.addWorksheet('실재고대조', { views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }] });
title(wsT, '장부재고(FIFO) vs 실재고 대조', 'ATG 실재고(정오 측정)를 전일 마감 장부재고와 비교 — 반나절 판매분 시차가 섞여 있어 일별 값보다 추세로 봐야 함');
const tg = wsT.getRow(4), th = wsT.getRow(5);
tg.getCell(1).value = '날짜'; wsT.mergeCells(4, 1, 5, 1);
FUELS.forEach((fuel, k) => {
  const c0 = 2 + k * 4; wsT.mergeCells(4, c0, 4, c0 + 3); tg.getCell(c0).value = fuel;
  ['전일 장부재고', '실재고', '차이(L)', '차이금액'].forEach((s, j) => { th.getCell(c0 + j).value = s; });
});
[tg, th].forEach(r => { for (let i = 1; i <= 13; i++) { const c = r.getCell(i);
  c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r === tg || i === 1 ? C.navy : C.head } };
  c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border; } });
wsT.getColumn(1).width = 12; for (let i = 2; i <= 13; i++) wsT.getColumn(i).width = 12;
// 대상: ATG 측정일 + 재고 스냅샷일
const snapByDate = {};
snapshots.forEach(s => { (snapByDate[s.date] = snapByDate[s.date] || {})[s.fuel] = s.stock ?? s.qty; });
const tDates = [...new Set([...tankActuals.map(t => t.date), ...Object.keys(snapByDate)])].sort()
  .filter(d => dIdx[d] && dIdx[d] > D0);
const T0 = 6;
const reconRows = [];
tDates.forEach((date, i) => {
  const r = T0 + i, row = wsT.getRow(r), pr = dIdx[date] - 1;
  row.getCell(1).value = toDate(date); styleCell(row.getCell(1), { fmt: DATE, align: 'center' });
  const rec = { date };
  FUELS.forEach((fuel, k) => {
    const c0 = 2 + k * 4, dc = 2 + k * 5;
    const bookCol = wsD.getColumn(dc + 2).letter, priceCol = wsD.getColumn(dc + 3).letter;
    const L = n => wsT.getColumn(c0 + n).letter;
    const di = pr - D0;
    const book = R[fuel].daily[di].book, price = R[fuel].daily[di].price;
    let act = snapByDate[date]?.[fuel] ?? atgMap[date]?.[fuel];
    if (!(act > 0)) act = null;
    const isSnap = snapByDate[date]?.[fuel] != null;
    rec[fuel] = { book, act, price };
    const v = [F(`'일별재고'!${bookCol}${pr}`, book), act,
      act == null ? null : F(`${L(1)}${r}-${L(0)}${r}`, act - book),
      act == null ? null : F(`${L(2)}${r}*'일별재고'!${priceCol}${pr}`, (act - book) * price)];
    v.forEach((x, j) => { const c = row.getCell(c0 + j); c.value = x;
      styleCell(c, { fmt: NUM, input: j === 1, color: j === 0 ? C.green : null, fill: isSnap && j === 1 ? C.warn : null, bold: j === 2 }); });
  });
  reconRows.push(rec);
});
const tLast = T0 + tDates.length - 1;
wsT.getCell(`A${tLast + 2}`).value = '※ 주황 칸 = purchase_lots.json에 수동 입력된 재고 스냅샷(실사값). 나머지는 탱크 실재고량.xlsx(ATG). 0으로 기록된 값은 측정 누락으로 보고 제외.';
wsT.getCell(`A${tLast + 3}`).value = '※ 차이(+) = 실재고가 장부보다 많음(입고 과소기록·판매 과다기록·온도팽창 등), 차이(−) = 실재고가 적음(입고 누락 기록 반대, 판매 누락, 손실).';
[2, 3].forEach(k => { wsT.getCell(`A${tLast + k}`).font = { name: FONT, size: 9, color: { argb: C.gray } }; });
FUELS.forEach((_, k) => {
  const col = wsT.getColumn(2 + k * 4 + 2).letter;
  wsT.addConditionalFormatting({ ref: `${col}${T0}:${col}${tLast}`, rules: [{ type: 'colorScale',
    cfvo: [{ type: 'min' }, { type: 'num', value: 0 }, { type: 'max' }], color: [{ argb: 'FFF8696B' }, { argb: 'FFFFFFFF' }, { argb: 'FF5B9BD5' }] }] });
});

// ════ 시트: 차트 (월별 피벗 + 그래프) ════
const wsC = wb.addWorksheet('차트');
title(wsC, '월별 손익 · 재고 소진 그래프', '아래 표는 월별분석 시트에서 SUMIFS로 끌어온 값 — 그래프는 이 표와 일별재고 시트를 참조');
const cHead = ['월', ...FUELS.map(f => `${f}\n매출총이익`), ...FUELS.map(f => `${f}\n재고효과`), ...FUELS.map(f => `${f}\n판매량`), ...FUELS.map(f => `${f}\n입고량`)];
header(wsC, 4, cHead, [9, ...cHead.slice(1).map(() => 12)]);
const C0 = 5;
const pivot = [];
months.forEach((m, i) => {
  const r = C0 + i, row = wsC.getRow(r);
  row.getCell(1).value = `${+m.slice(5)}월`; styleCell(row.getCell(1), { align: 'center' });
  const rec = { m };
  const sumifs = (col, fuel, val) => F(`SUMIFS('월별분석'!${col}$${M0}:${col}$${mLast},'월별분석'!$A$${M0}:$A$${mLast},"${m}",'월별분석'!$B$${M0}:$B$${mLast},"${fuel}")`, val);
  FUELS.forEach((fuel, k) => {
    const x = monthly.find(y => y.m === m && y.fuel === fuel);
    rec[fuel] = x;
    [[1 + k, 'L', x.rev - x.cost], [4 + k, 'O', x.repl - x.cost], [7 + k, 'H', x.sold], [10 + k, 'E', x.inQty]].forEach(([off, col, v]) => {
      const c = row.getCell(1 + off); c.value = sumifs(col, fuel, v); styleCell(c, { fmt: NUM, color: C.green });
    });
  });
  pivot.push(rec);
});
const cLast = C0 + months.length - 1;
const cTot = cLast + 1;
wsC.getRow(cTot).getCell(1).value = '합계'; styleCell(wsC.getRow(cTot).getCell(1), { bold: true, align: 'center', fill: C.sub });
for (let j = 2; j <= cHead.length; j++) {
  const L = wsC.getColumn(j).letter, c = wsC.getRow(cTot).getCell(j);
  const fuel = FUELS[(j - 2) % 3], kind = Math.floor((j - 2) / 3);
  const v = monthly.filter(x => x.fuel === fuel).reduce((s, x) => s + [x.rev - x.cost, x.repl - x.cost, x.sold, x.inQty][kind], 0);
  c.value = F(`SUM(${L}${C0}:${L}${cLast})`, v); styleCell(c, { fmt: NUM, bold: true, fill: C.sub });
}

// ════ 시트: 요약 ════
const wsS = wb.addWorksheet('요약');
title(wsS, `미소주유소 2026년 입고·판매 선입선출(FIFO) 분석`, `기간 ${FIRST} ~ ${LAST} (${dates.length}일)  |  생성 ${new Date().toISOString().slice(0, 10)}  |  모든 수치는 다른 시트 수식으로 연결됨`);
wsS.getColumn(1).width = 30; [2, 3, 4, 5].forEach(i => { wsS.getColumn(i).width = 17; });
header(wsS, 4, ['항목', ...FUELS, '합계']);
const sumM = (col, fuel) => `SUMIFS('월별분석'!${col}$${M0}:${col}$${mLast},'월별분석'!$B$${M0}:$B$${mLast},"${fuel}")`;
const lastM = (col, fuel) => `SUMIFS('월별분석'!${col}$${M0}:${col}$${mLast},'월별분석'!$B$${M0}:$B$${mLast},"${fuel}",'월별분석'!$A$${M0}:$A$${mLast},"${months[months.length - 1]}")`;
const cntL = (fuel, st) => `COUNTIFS('입고별소진'!$B$${L0}:$B$${lLast},"${fuel}",'입고별소진'!$J$${L0}:$J$${lLast},"${st}")`;
const tot = f => FUELS.reduce((s, x) => s + f(x), 0);
const mt = (fuel, key) => monthly.filter(x => x.fuel === fuel).reduce((s, x) => s + x[key], 0);
const lastRec = fuel => monthly.find(x => x.fuel === fuel && x.m === months[months.length - 1]);
const lotsOf = (fuel, st) => lotRows.filter(l => l.fuel === fuel && (st === '완판' ? !l.ghost && l.rem === 0 : st === '판매중' ? !l.ghost && l.rem > 0 && l.chunks.length : st === '미판매' ? !l.ghost && !l.chunks.length : !!l.ghost)).length;
const sRows = [
  ['기초재고 1/1 (L)', f => F(`SUMIFS('월별분석'!C$${M0}:C$${mLast},'월별분석'!$B$${M0}:$B$${mLast},"${f}",'월별분석'!$A$${M0}:$A$${mLast},"${months[0]}")`, opening[f].qty), NUM, 'sum'],
  ['총 입고량 (L)', f => F(sumM('E', f), mt(f, 'inQty')), NUM, 'sum'],
  ['총 입고금액 (원)', f => F(sumM('F', f), mt(f, 'inAmt')), NUM, 'sum'],
  ['총 판매량 (L)', f => F(sumM('H', f), mt(f, 'sold')), NUM, 'sum'],
  ['총 매출액 (원)', f => F(sumM('I', f), mt(f, 'rev')), NUM, 'sum'],
  ['FIFO 매출원가 (원)', f => F(sumM('K', f), mt(f, 'cost')), NUM, 'sum'],
  ['매출총이익 (원)', f => F(sumM('L', f), mt(f, 'rev') - mt(f, 'cost')), NUM, 'sum', true],
  ['L당 마진 (원)', null, NUM1, 'ratio'],
  ['선입선출 재고효과 (원)', f => F(sumM('O', f), mt(f, 'repl') - mt(f, 'cost')), NUM, 'sum', true],
  ['└ 재고효과 제외 시 이익 (원)', null, NUM, 'diff'],
  [`현재 장부재고 ${LAST} (L)`, f => F(lastM('P', f), lastRec(f).endQ), NUM, 'sum'],
  ['현재 장부재고 금액 (원)', f => F(lastM('Q', f), lastRec(f).endA), NUM, 'sum'],
  ['입고 건수 (1/1 기초 포함)', f => F(`COUNTIFS('입고별소진'!$B$${L0}:$B$${lLast},"${f}",'입고별소진'!$J$${L0}:$J$${lLast},"<>미등록")`, lotRows.filter(l => l.fuel === f && !l.ghost).length), NUM, 'sum'],
  ['└ 완판', f => F(cntL(f, '완판'), lotsOf(f, '완판')), NUM, 'sum'],
  ['└ 판매중 (탱크에 남아있음)', f => F(cntL(f, '판매중'), lotsOf(f, '판매중')), NUM, 'sum'],
  ['└ 미판매', f => F(cntL(f, '미판매'), lotsOf(f, '미판매')), NUM, 'sum'],
  ['입고 미등록 추정 판매량 (L)', f => F(`SUMIFS('입고별소진'!$D$${L0}:$D$${lLast},'입고별소진'!$B$${L0}:$B$${lLast},"${f}",'입고별소진'!$J$${L0}:$J$${lLast},"미등록")`, R[f].ghost?.qty || 0), NUM, 'sum'],
];
const S0 = 5;
sRows.forEach(([label, fn, fmt, kind, bold], i) => {
  const r = S0 + i, row = wsS.getRow(r);
  row.getCell(1).value = label; styleCell(row.getCell(1), { bold });
  FUELS.forEach((fuel, k) => {
    const c = row.getCell(2 + k), L = wsS.getColumn(2 + k).letter;
    if (kind === 'ratio') c.value = F(`IFERROR(${L}${S0 + 6}/${L}${S0 + 3},0)`, (mt(fuel, 'rev') - mt(fuel, 'cost')) / mt(fuel, 'sold'));
    else if (kind === 'diff') c.value = F(`${L}${S0 + 6}-${L}${S0 + 8}`, mt(fuel, 'rev') - mt(fuel, 'repl'));
    else c.value = fn(fuel);
    styleCell(c, { fmt, color: kind === 'sum' ? C.green : null, bold });
  });
  const c = row.getCell(5);
  if (kind === 'ratio') c.value = F(`IFERROR(E${S0 + 6}/E${S0 + 3},0)`, tot(f => mt(f, 'rev') - mt(f, 'cost')) / tot(f => mt(f, 'sold')));
  else if (kind === 'diff') c.value = F(`E${S0 + 6}-E${S0 + 8}`, tot(f => mt(f, 'rev') - mt(f, 'repl')));
  else c.value = F(`SUM(B${r}:D${r})`, tot(f => fn(f).result));
  styleCell(c, { fmt, bold: true, fill: C.sub });
});
const sEnd = S0 + sRows.length;
wb.summaryFindingsRow = sEnd + 1;

// ════ 시트: 계산기준 ════
const wsN = wb.addWorksheet('계산기준');
wsN.getColumn(1).width = 120;
const notes = [
  ['계산 기준', true],
  ['• 입고: webapp/data/purchase_lots.json (재고 스냅샷 type:"stock"/stock 필드 행 제외 — 앱 recomputeFifoPrices와 동일). 2026-01-01 lot은 기초재고로 봄.'],
  ['• 판매: webapp/data/daily/*.json 의 BOS 유종별 판매량·판매금액. 0원 탱크로리 적재 행은 파서에서 이미 제외됨.'],
  ['• 선입선출: 판매일에 입고된(입고일 ≤ 판매일) lot부터 오래된 순서로 소진. 같은 날 입고분은 당일 판매에 사용 가능.'],
  ['• 재고가 바닥났는데 판매가 계속된 경우(입고 등록 누락 의심) → 다음에 들어온 lot이 그 판매분을 먼저 충당(앱과 동일한 결과). 끝까지 충당 안 된 분량은 "미등록" 행으로 표시하고 마지막 입고단가로 원가 계산.'],
  ['• 배정 매출액: 각 lot이 소진된 날의 유종별 평균 판매단가(그날 매출액 ÷ 판매량) × 그 lot에서 나간 리터.'],
  ['• 매출총이익 = 매출액 − FIFO 매출원가. 카드수수료·인건비·지원금 등은 빠진 순수 유류 판매마진.'],
  ['• 선입선출 재고효과 = 판매일 기준 "최근 입고단가"로 원가를 잡았을 때와 FIFO 원가의 차이. (+) 이득 = 단가 오르기 전에 싸게 사둔 재고를 판 효과, (−) 손해 = 단가 내리기 전에 비싸게 사둔 재고를 판 효과.'],
  ['• 매입단가·판매금액은 시스템에 기록된 값 그대로 사용 (부가세 포함 여부는 두 값이 같은 기준이라고 가정).'],
  [''],
  ['주의할 점', true],
  ['• 장부재고는 BOS 판매량(15℃ 환산 리터)과 입고 리터로만 계산. ATG 실재고(실온 리터, 정오 측정)와는 온도·측정시각 차이가 있음.'],
  ['• 입고 등록 누락·중복이 있으면 해당 lot 이후의 소진 시점과 손익 배분이 밀림 → "입고별소진" 비고(⚠)와 "일별재고" 음수 칸을 먼저 확인.'],
  ['• 이 파일은 scripts/fifo-report/build.js 로 다시 만들 수 있음 (node scripts/fifo-report/build.js). 원자료가 바뀌면 재실행.'],
  [''],
  ['색 구분', true],
  ['• 파란 글씨 = 원자료 또는 FIFO 계산 스크립트가 넣은 값  •  검정 글씨 = 엑셀 수식  •  초록 글씨 = 다른 시트에서 끌어온 값'],
];
notes.forEach(([t, b], i) => { const c = wsN.getCell(`A${i + 1}`); c.value = t;
  c.font = { name: FONT, size: b ? 12 : 10, bold: !!b, color: { argb: b ? C.navy : 'FF000000' } }; c.alignment = { wrapText: true }; });

// 핵심 발견 (요약 시트 하단)
function findings() {
  const out = [];
  const won = v => `${Math.round(v).toLocaleString()}원`, lit = v => `${Math.round(v).toLocaleString()}L`;
  for (const fuel of FUELS) {
    const gp = mt(fuel, 'rev') - mt(fuel, 'cost'), eff = mt(fuel, 'repl') - mt(fuel, 'cost');
    const sold = mt(fuel, 'sold');
    const open = lotRows.filter(l => l.fuel === fuel && !l.ghost && l.rem > 0);
    const end = lastRec(fuel).endQ;
    out.push(`[${fuel}] 매출총이익 ${won(gp)} (L당 ${(gp / sold).toFixed(1)}원), 그중 선입선출 재고효과 ${eff >= 0 ? '+' : ''}${won(eff)}.`);
    if (open.length) out.push(`   남은 재고 ${lit(end)}: ${open.map(l => `${l.date.slice(5)} 입고분 ${lit(l.rem)}@${l.price}`).join(', ')}.`);
    else if (end < 0) out.push(`   입고된 기름은 전부 팔렸고, 기록상 입고보다 ${lit(-end)} 더 팔림 → 입고 등록 누락 의심.`);
    const bestM = pivot.reduce((a, p) => (p[fuel].repl - p[fuel].cost) > (a[fuel].repl - a[fuel].cost) ? p : a);
    const worstM = pivot.reduce((a, p) => (p[fuel].repl - p[fuel].cost) < (a[fuel].repl - a[fuel].cost) ? p : a);
    out.push(`   재고효과 최대 이득 ${+bestM.m.slice(5)}월 ${won(bestM[fuel].repl - bestM[fuel].cost)}, 최대 손해 ${+worstM.m.slice(5)}월 ${won(worstM[fuel].repl - worstM[fuel].cost)}.`);
    const neg = R[fuel].daily.filter(d => d.book < -0.5);
    if (neg.length) out.push(`   ⚠ 장부재고 음수 ${neg.length}일 (${neg[0].date} ~ ${neg[neg.length - 1].date}) — 그 기간 입고 기록 확인 필요.`);
    const diffs = reconRows.filter(x => x[fuel].act != null).map(x => x[fuel].act - x[fuel].book);
    if (diffs.length) {
      const avg = diffs.reduce((s, v) => s + v, 0) / diffs.length;
      // ATG는 정오 측정 → 반나절 판매·오전 입고만큼은 늘 차이남. 그보다 크면 경고
      const limit = Math.max(3000, 0.5 * sold / dates.length);
      out.push(`   실재고(ATG ${diffs.length}회 측정)는 장부보다 평균 ${avg >= 0 ? '+' : ''}${lit(avg)}${Math.abs(avg) > limit ? ' ⚠ 꾸준히 차이남 → 기초재고·초기 입고 기록 확인 필요' : ' (측정 시각 차이 수준)'}.`);
    }
  }
  return out;
}
const fr = wb.summaryFindingsRow;
wsS.getCell(`A${fr}`).value = '핵심 내용'; wsS.getCell(`A${fr}`).font = { name: FONT, size: 12, bold: true, color: { argb: C.navy } };
const fl = findings();
fl.forEach((t, i) => { const c = wsS.getCell(`A${fr + 1 + i}`); c.value = t; c.font = { name: FONT, size: 10, color: { argb: t.includes('⚠') ? 'FFC00000' : 'FF000000' } }; });
console.log(fl.join('\n'));

// 시트 순서: 요약을 맨 앞으로
wsS.orderNo = -1;
wb._worksheets = [undefined, wsS, wsM, wsL, wsD, wsT, wsC, wsN];
wb._worksheets.slice(1).forEach((ws, i) => { ws.id = i + 1; ws.orderNo = i; });

// ── 차트 주입 (exceljs는 차트 미지원 → OOXML 직접 작성) ──
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xlDate = s => (toDate(s) - Date.UTC(1899, 11, 30)) / 864e5;
const PALETTE = { 경유: '1F4E79', 휘발유: 'C55A11', 등유: '548235' };
const numCache = (vals, fmt = 'General') => `<c:numCache><c:formatCode>${fmt}</c:formatCode><c:ptCount val="${vals.length}"/>${
  vals.map((v, i) => v == null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`;
const strCache = vals => `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
const titleXml = t => `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="ko-KR" sz="1200" b="1"><a:latin typeface="${FONT}"/><a:ea typeface="${FONT}"/></a:rPr><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
const valAx = (id, cross) => `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E0E0E0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="ko-KR"/></a:p></c:txPr><c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
const wrap = (t, plot) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${titleXml(t)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="ko-KR"/></a:p></c:txPr></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr><a:latin typeface="${FONT}"/><a:ea typeface="${FONT}"/></a:defRPr></a:pPr><a:endParaRPr lang="ko-KR"/></a:p></c:txPr></c:chartSpace>`;

function barChart(t, cols) { // cols: [{col letter, name, color}]
  const cat = `<c:cat><c:strRef><c:f>'차트'!$A$${C0}:$A$${cLast}</c:f>${strCache(months.map(m => `${+m.slice(5)}월`))}</c:strRef></c:cat>`;
  const sers = cols.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>${cat}<c:val><c:numRef><c:f>'차트'!$${s.col}$${C0}:$${s.col}$${cLast}</c:f>${numCache(s.vals)}</c:numRef></c:val></c:ser>`).join('');
  return wrap(t, `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:gapWidth val="60"/><c:overlap val="-10"/><c:axId val="2001"/><c:axId val="2002"/></c:barChart><c:catAx><c:axId val="2001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:crossAx val="2002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>${valAx(2002, 2001)}`);
}
function lineChart(t, fuel) {
  const k = FUELS.indexOf(fuel), dc = 2 + k * 5;
  const colOf = n => wsD.getColumn(n).letter;
  const cat = `<c:cat><c:numRef><c:f>'일별재고'!$A$${D0}:$A$${dLast}</c:f>${numCache(dates.map(xlDate), 'yyyy-mm-dd')}</c:numRef></c:cat>`;
  const ser = (i, col, name, color, vals, dash) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(name)}</c:v></c:tx><c:spPr><a:ln w="${dash ? 15875 : 22225}" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${dash ? '<a:prstDash val="sysDash"/>' : ''}</a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>${cat}<c:val><c:numRef><c:f>'일별재고'!$${col}$${D0}:$${col}$${dLast}</c:f>${numCache(vals)}</c:numRef></c:val><c:smooth val="0"/></c:ser>`;
  const d = R[fuel].daily;
  const sers = ser(0, colOf(dc + 2), '장부재고(FIFO)', PALETTE[fuel], d.map(x => +x.book.toFixed(1)))
    + ser(1, colOf(dc + 4), 'ATG 실재고', '7F7F7F', dates.map(dt => atgMap[dt]?.[fuel] > 0 ? atgMap[dt][fuel] : null), true);
  return wrap(t, `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="3001"/><c:axId val="3002"/></c:lineChart><c:dateAx><c:axId val="3001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="m/d" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="ko-KR"/></a:p></c:txPr><c:crossAx val="3002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblOffset val="100"/><c:baseTimeUnit val="days"/><c:majorUnit val="1"/><c:majorTimeUnit val="months"/></c:dateAx>${valAx(3002, 3001)}`);
}
const colC = n => wsC.getColumn(n).letter;
const charts = [
  barChart('월별 매출총이익 (원)', FUELS.map((f, k) => ({ col: colC(2 + k), name: f, color: PALETTE[f], vals: pivot.map(p => Math.round(p[f].rev - p[f].cost)) }))),
  barChart('월별 선입선출 재고효과 (원) — (+) 싸게 사둔 재고 덕 이득 / (−) 손해', FUELS.map((f, k) => ({ col: colC(5 + k), name: f, color: PALETTE[f], vals: pivot.map(p => Math.round(p[f].repl - p[f].cost)) }))),
  ...FUELS.map(f => lineChart(`${f} 재고 소진 추이 (L) — 입고 시 상승, 판매로 하락`, f)),
];
// 배치: 피벗 아래부터 2열 그리드
const anchors = charts.map((_, i) => {
  const top = cTot + 2 + Math.floor(i / 2) * 22, left = (i % 2) * 7;
  return i >= 2 ? { c1: 0, r1: cTot + 2 + 22 + (i - 2) * 22, c2: 13, r2: cTot + 2 + 22 + (i - 2) * 22 + 21 } : { c1: left, r1: top, c2: left + 7, r2: top + 21 };
});
const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.map((a, i) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${a.c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${a.c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`).join('')}</xdr:wsDr>`;

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const buf = await wb.xlsx.writeBuffer();
  const zip = await JSZip.loadAsync(buf);
  // '차트' 시트 파일 찾기
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const rid = wbXml.match(/<sheet [^>]*name="차트"[^>]*r:id="(rId\d+)"/)[1];
  const target = wbRels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`)).slice(1).find(Boolean);
  const sheetPath = 'xl/' + target.replace(/^\/?xl\//, '');
  const sheetName = path.posix.basename(sheetPath);
  let sx = await zip.file(sheetPath).async('string');
  const relsPath = `xl/worksheets/_rels/${sheetName}.rels`;
  let rels = zip.file(relsPath) ? await zip.file(relsPath).async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  rels = rels.replace('</Relationships>', '<Relationship Id="rIdDrw1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  if (!/xmlns:r=/.test(sx.slice(0, 600))) sx = sx.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  const ins = ['<legacyDrawing', '<tableParts', '<extLst', '</worksheet>'].map(t => sx.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0];
  sx = sx.slice(0, ins) + '<drawing r:id="rIdDrw1"/>' + sx.slice(ins);
  zip.file(sheetPath, sx);
  zip.file(relsPath, rels);
  zip.file('xl/drawings/drawing1.xml', drawingXml);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${charts.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`).join('')}</Relationships>`);
  charts.forEach((x, i) => zip.file(`xl/charts/chart${i + 1}.xml`, x));
  let ct = await zip.file('[Content_Types].xml').async('string');
  ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
    + charts.map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('') + '</Types>');
  zip.file('[Content_Types].xml', ct);
  fs.writeFileSync(OUT, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('저장:', OUT);
})();
