'use strict';
const XLSX = require('xlsx');

function parseDate(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    return `${d.y}/${String(d.m).padStart(2,'0')}/${String(d.d).padStart(2,'0')}`;
  }
  return String(val).replace(/-/g, '/');
}

// 배달 거래내역 Excel 파싱 (월간 BOS와 동일 포맷)
// 반환: [{ vendor, date, product, qty, vehicle }]
function parseDelivery(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    .slice(3)
    .filter(r => r[0] != null);

  return rows
    .map(r => ({
      vendor:  String(r[4] || '').trim(),
      date:    parseDate(r[1]),
      product: String(r[11] || '경유').trim(),
      qty:     r[12] || 0,
      vehicle: String(r[6] || '').trim(),
    }))
    .filter(d => d.vendor && d.date);
}

module.exports = { parseDelivery };
