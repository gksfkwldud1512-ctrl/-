'use strict';
const XLSX = require('xlsx');

// 마감자료.xlsx 판매관리 시트 파싱 → FIFO 매입단가 변경 이벤트 추출
// 컬럼 구조:
//   col 0  : 일자 (Excel 날짜 시리얼)
//   col 9  : 휘발유 매입단가   col 10: 휘발유 실재고   col 12: 휘발유 매입량
//   col 20 : 경유 매입단가     col 21: 경유 실재고     col 23: 경유 매입량
//   col 31 : 등유 매입단가     col 32: 등유 실재고     col 34: 등유 매입량
function parseSalesMgmt(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['판매관리'];
  if (!ws) throw new Error('판매관리 시트를 찾을 수 없습니다');

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const dataRows = rows.slice(6).filter(r => typeof r[0] === 'number' && r[0] > 40000);

  function parseDate(n) {
    const d = XLSX.SSF.parse_date_code(n);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }

  const FUELS = [
    { name: '휘발유', buyPriceCol: 9,  remainingCol: 10, buyQtyCol: 12 },
    { name: '경유',   buyPriceCol: 20, remainingCol: 21, buyQtyCol: 23 },
    { name: '등유',   buyPriceCol: 31, remainingCol: 32, buyQtyCol: 34 },
  ];

  const priceChanges = [];   // { date, fuel, price } — 단가 변경 시점만
  const prevPrices   = {};   // { fuel: lastPrice }

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

module.exports = { parseSalesMgmt };
