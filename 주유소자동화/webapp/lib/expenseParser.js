'use strict';
const XLSX = require('xlsx');

// 주유소 마감자료.xlsx 지출관리 시트 파싱
// 컬럼: col0=사용월(엑셀날짜), col1=대분류, col2=소분류, col3=거래처명, col4=금액
function parseExpenses(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['지출관리'];
  if (!ws) throw new Error('지출관리 시트를 찾을 수 없습니다');

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const result = [];

  for (const row of rows.slice(1)) {
    const amount = Number(row[4]) || 0;
    if (!row[0] || !row[1] || amount <= 0) continue;

    let month;
    if (typeof row[0] === 'number') {
      const d = XLSX.SSF.parse_date_code(row[0]);
      month = d ? `${d.y}-${String(d.m).padStart(2,'0')}` : null;
    } else {
      month = String(row[0]).slice(0, 7);  // "YYYY-MM"
    }
    if (!month) continue;

    result.push({
      month,
      category:    String(row[1] || '').trim(),  // 대분류 (고정비/변동비)
      subCategory: String(row[2] || '').trim(),  // 소분류
      vendor:      String(row[3] || '').trim(),  // 거래처명
      amount,
    });
  }

  return result;
}

module.exports = { parseExpenses };
