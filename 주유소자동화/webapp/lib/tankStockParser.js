'use strict';
const XLSX = require('xlsx');

// 탱크 실재고량.xlsx 파싱
// col0: 날짜, col12: 휘발유 합계(L), col13: 경유 합계(L), col14: 등유 합계(L)
function parseTankStock(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const result = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rawDate = r[0];
    if (!rawDate) continue;

    // 날짜 파싱: Excel serial 또는 문자열
    let dateStr = '';
    if (typeof rawDate === 'number' && rawDate > 40000) {
      // Excel 날짜 시리얼 → YYYY-MM-DD
      const d = new Date((rawDate - 25569) * 86400 * 1000);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      dateStr = `${y}-${m}-${day}`;
    } else if (typeof rawDate === 'string') {
      const s = rawDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) dateStr = s;
      else continue;
    } else {
      continue;
    }

    const 휘발유 = Number(r[12]) || 0;
    const 경유   = Number(r[13]) || 0;
    const 등유   = Number(r[14]) || 0;

    // 세 유종 모두 0이면 헤더 또는 빈 행
    if (!휘발유 && !경유 && !등유) continue;

    result.push({ date: dateStr, 휘발유, 경유, 등유 });
  }

  // 날짜 오름차순 정렬, 중복 날짜 첫 번째만 유지
  const seen = new Set();
  const deduped = [];
  result.sort((a, b) => a.date.localeCompare(b.date));
  for (const item of result) {
    if (!seen.has(item.date)) { seen.add(item.date); deduped.push(item); }
  }

  return deduped;
}

module.exports = { parseTankStock };
