'use strict';
const XLSX = require('xlsx');

// 마감자료.xlsx 판매관리 시트 파싱
// 컬럼 구조:
//   col 0  : 일자 (Excel 날짜 시리얼)
//   col 9  : 휘발유 매입단가   col 10: 휘발유 실재고   col 12: 휘발유 매입량   col 14: 휘발유 전월재고
//   col 20 : 경유 매입단가     col 21: 경유 실재고     col 23: 경유 매입량     col 25: 경유 전월재고
//   col 31 : 등유 매입단가     col 32: 등유 실재고     col 34: 등유 매입량     col 36: 등유 전월재고

const FUELS = [
  { name: '휘발유', buyPriceCol: 9,  remainingCol: 10, buyQtyCol: 12, prevStockCol: 14, sellQtyCol: 4  },
  { name: '경유',   buyPriceCol: 20, remainingCol: 21, buyQtyCol: 23, prevStockCol: 25, sellQtyCol: 15 },
  { name: '등유',   buyPriceCol: 31, remainingCol: 32, buyQtyCol: 34, prevStockCol: 36, sellQtyCol: 26 },
];

function parseDate(n) {
  const d = XLSX.SSF.parse_date_code(n);
  if (!d) return null;
  return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
}

function readSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['판매관리'];
  if (!ws) throw new Error('판매관리 시트를 찾을 수 없습니다');
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    .slice(6)
    .filter(r => typeof r[0] === 'number' && r[0] > 40000);
}

// FIFO 단가 변경 이벤트 추출 (기존 기능 유지)
function parseSalesMgmt(filePath) {
  const dataRows = readSheet(filePath);
  const priceChanges = [];
  const prevPrices   = {};

  for (const row of dataRows) {
    const date = parseDate(row[0]);
    if (!date) continue;
    for (const fuel of FUELS) {
      const price = row[fuel.buyPriceCol];
      if (!price || typeof price !== 'number') continue;
      if (price !== prevPrices[fuel.name]) {
        priceChanges.push({ date, fuel: fuel.name, price });
        prevPrices[fuel.name] = price;
      }
    }
  }
  return priceChanges;
}

// 입고 이력(lot) 추출
// 가격 결정 규칙:
//   - 개시재고(1/1): 판매관리 daily 매입단가(전년도 단가) 사용
//   - 신규 매입: 상단 정산단가 표의 기간별 단가 사용 (실제 GS칼텍스 청구 단가)
function extractLots(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['판매관리'];
  if (!ws) throw new Error('판매관리 시트를 찾을 수 없습니다');
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // ── 1. 상단 정산단가 표 파싱 ──────────────────────────────────
  // row0: 헤더 (기간명)  row1: 휘발유  row2: 경유  row3: 등유
  // 컬럼 인덱스: col5=1월 col6=2월 col7=3월 col8=시작가3/13 col9=시작가3/27 col10=시작가4/10
  const PRICE_PERIODS = [
    { key: '1월',        colIdx: 5,  start: '2026-01-01', end: '2026-01-31' },
    { key: '2월',        colIdx: 6,  start: '2026-02-01', end: '2026-02-29' },
    { key: '3월',        colIdx: 7,  start: '2026-03-01', end: '2026-03-12' },
    { key: '시작가3/13', colIdx: 8,  start: '2026-03-13', end: '2026-03-26' },
    { key: '시작가3/27', colIdx: 9,  start: '2026-03-27', end: '9999-12-31' },
  ];

  // 연료 행 인덱스: row1=휘발유, row2=경유, row3=등유
  const FUEL_ROWS = { '휘발유': 1, '경유': 2, '등유': 3 };

  function getSettlementPrice(fuelName, date) {
    for (let i = PRICE_PERIODS.length - 1; i >= 0; i--) {
      if (date >= PRICE_PERIODS[i].start && date <= PRICE_PERIODS[i].end) {
        const rowIdx = FUEL_ROWS[fuelName];
        return Number(allRows[rowIdx]?.[PRICE_PERIODS[i].colIdx]) || 0;
      }
    }
    return 0;
  }

  // ── 2. 일별 데이터 파싱 ──────────────────────────────────────
  const dataRows = allRows.slice(6).filter(r => typeof r[0] === 'number' && r[0] > 40000);

  const lots = [];
  const firstRow  = dataRows[0];
  const firstDate = parseDate(firstRow[0]);

  // 개시재고(1/1): 전년도 단가 = daily 매입단가 컬럼 값 사용
  for (const fuel of FUELS) {
    const openingStock = Math.round(Number(firstRow[fuel.remainingCol]) || 0);
    const initPrice    = Number(firstRow[fuel.buyPriceCol]) || 0;
    if (openingStock > 0 && initPrice > 0) {
      lots.push({ date: firstDate, fuel: fuel.name, qty: openingStock, price: initPrice });
    }
  }

  // 신규 매입: 정산단가 적용
  for (const row of dataRows) {
    const date = parseDate(row[0]);
    if (!date || date === firstDate) continue;

    for (const fuel of FUELS) {
      const buyQty = Number(row[fuel.buyQtyCol]) || 0;
      if (buyQty <= 0) continue;

      const lotPrice = getSettlementPrice(fuel.name, date);
      if (lotPrice > 0) {
        lots.push({ date, fuel: fuel.name, qty: buyQty, price: lotPrice });
      }
    }
  }

  lots.sort((a, b) => a.date.localeCompare(b.date) || a.fuel.localeCompare(b.fuel));
  return lots;
}

// 판매관리 시트 → 일별 FIFO 단가 + 실재고 추출
// 이 데이터가 영업이익 계산의 기준 (선입선출이 이미 계산된 결과)
function extractFifoDaily(filePath) {
  const dataRows = readSheet(filePath);

  const seen   = new Set();
  const result = [];
  for (const row of dataRows) {
    const date = parseDate(row[0]);
    if (!date || seen.has(date)) continue; // 날짜 중복 첫 번째만 사용
    seen.add(date);

    const entry = { date };
    let hasAny = false;

    for (const fuel of FUELS) {
      const price     = Number(row[fuel.buyPriceCol]) || 0;
      const remaining = Number(row[fuel.remainingCol]) || 0;
      if (price > 0) {
        const soldQty = Math.round((Number(row[fuel.sellQtyCol]) || 0) * 100) / 100;
        entry[fuel.name] = { price, remaining: Math.round(remaining), soldQty };
        hasAny = true;
      }
    }

    if (hasAny) result.push(entry);
  }

  return result;
}

module.exports = { parseSalesMgmt, extractLots, extractFifoDaily };
