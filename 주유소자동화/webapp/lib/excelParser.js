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

function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    .slice(3)
    .filter(r => r[0] != null);

  const custMap = {};

  rows.forEach(r => {
    const name = r[4];
    if (!name) return;

    const payType = String(r[8] || '').trim();
    const amount  = r[14] || 0;
    const isCredit = payType === '외상';

    if (!custMap[name]) {
      custMap[name] = {
        name,
        no:          r[3] || '',
        totalCredit: 0,   // 외상 합계
        totalOther:  0,   // 카드/현금 합계
        total:       0,   // 전체 합계
        hasCredit:   false,
        txs:         [],  // 외상 거래만 (거래명세서 생성용)
      };
    }

    custMap[name].total += amount;

    if (isCredit) {
      custMap[name].totalCredit += amount;
      custMap[name].hasCredit    = true;
      custMap[name].txs.push({
        date:      parseDate(r[1]),
        vehicle:   r[6] || '',
        product:   r[11] || '경유',
        qty:       r[12] || 0,
        unitPrice: r[13] || 0,
        amount,
        taxType:   r[17] || '과세',
      });
    } else {
      custMap[name].totalOther += amount;
    }
  });

  return Object.values(custMap).sort((a, b) =>
    a.name.localeCompare(b.name, 'ko')
  );
}

// 일반 Excel → JSON 변환 (고객 등록 양식 등 범용)
function parseExcelRows(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const ws = sheetName && wb.Sheets[sheetName]
    ? wb.Sheets[sheetName]
    : wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

module.exports = { parseExcel, parseExcelRows };
