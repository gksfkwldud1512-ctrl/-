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
// 가격 결정 규칙: 구매일 이후 다음 단가변경 시점의 가격 = 해당 lot의 매입가
// (현재 소비 중인 lot가 소진된 후 이 lot가 소비되므로 다음 단가 = 이 lot 가격)
function extractLots(filePath) {
  const dataRows    = readSheet(filePath);
  const priceChanges = parseSalesMgmt(filePath);  // { date, fuel, price }[]

  // 연료별 다음 단가 조회 함수
  function nextPrice(afterDate, fuelName) {
    const next = priceChanges.find(p => p.fuel === fuelName && p.date > afterDate);
    return next ? next.price : null;
  }

  // 연료별 현재 단가 조회 (해당일 <= date 인 마지막 단가)
  function currentPrice(date, fuelName) {
    let found = null;
    for (const p of priceChanges) {
      if (p.fuel === fuelName && p.date <= date) found = p.price;
    }
    return found;
  }

  const lots = [];
  const firstRow = dataRows[0];
  const firstDate = parseDate(firstRow[0]);

  // 전월재고를 첫 lot으로 등록 (초기 재고)
  // prevStockCol은 당일 판매 후 남은 잔량 → 첫날 판매량(sellQtyCol)을 더해야 실제 개시재고
  for (const fuel of FUELS) {
    const endOfDayRemaining = Number(firstRow[fuel.prevStockCol]) || 0;
    const firstDaySold      = Number(firstRow[fuel.sellQtyCol])   || 0;
    const openingStock      = endOfDayRemaining + firstDaySold;
    const initPrice         = Number(firstRow[fuel.buyPriceCol])  || 0;
    if (openingStock > 0 && initPrice > 0) {
      lots.push({ date: firstDate, fuel: fuel.name, qty: Math.round(openingStock), price: initPrice });
    }
  }

  // 매입량 > 0 인 날 → 입고 lot 생성
  for (const row of dataRows) {
    const date = parseDate(row[0]);
    if (!date) continue;

    for (const fuel of FUELS) {
      const buyQty = Number(row[fuel.buyQtyCol]) || 0;
      if (buyQty <= 0) continue;

      // 단가가 오늘 바뀌었는가? (오늘 이후 첫 단가변경이 오늘인지 확인)
      const todayChange = priceChanges.find(p => p.fuel === fuel.name && p.date === date);
      let lotPrice;

      if (todayChange) {
        // 단가 변경일에 구매 → 해당일 이후 다음 변경 단가
        const next = nextPrice(date, fuel.name);
        lotPrice = next ?? todayChange.price;
      } else {
        // 단가 변경 전 구매 → 다음 단가변경 가격
        const next = nextPrice(date, fuel.name);
        if (next) {
          lotPrice = next;
        } else {
          // 다음 변경 없음 → 현재 적용 단가
          lotPrice = currentPrice(date, fuel.name) ?? Number(row[fuel.buyPriceCol]);
        }
      }

      if (lotPrice && buyQty > 0) {
        lots.push({ date, fuel: fuel.name, qty: buyQty, price: lotPrice });
      }
    }
  }

  // 날짜 오름차순 정렬
  lots.sort((a, b) => a.date.localeCompare(b.date) || a.fuel.localeCompare(b.fuel));
  return lots;
}

// 판매관리 시트 → 일별 FIFO 단가 + 실재고 추출
// 이 데이터가 영업이익 계산의 기준 (선입선출이 이미 계산된 결과)
function extractFifoDaily(filePath) {
  const dataRows = readSheet(filePath);

  const result = [];
  for (const row of dataRows) {
    const date = parseDate(row[0]);
    if (!date) continue;

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
