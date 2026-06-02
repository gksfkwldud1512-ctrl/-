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

    const payType   = String(r[8] || '').trim();
    const amount    = r[14] || 0;
    const isCredit  = payType === '외상';
    const date      = parseDate(r[1]);
    const vehicle   = r[6] || '';
    const product   = r[11] || '경유';
    const qty       = r[12] || 0;
    const unitPrice = r[13] || 0;

    if (!custMap[name]) {
      custMap[name] = {
        name,
        no:          r[3] || '',
        totalCredit: 0,
        totalOther:  0,
        total:       0,
        hasCredit:   false,
        txs:         [],  // 외상 거래만 (거래명세서 생성용)
        _allTxs:     [],  // 전체 거래 (검증용, 반환 전 제거)
        errors:      [],
        hasError:    false,
      };
    }

    custMap[name].total += amount;
    custMap[name]._allTxs.push({ date, vehicle, product, qty, unitPrice, isCredit });

    if (isCredit) {
      custMap[name].totalCredit += amount;
      custMap[name].hasCredit    = true;
      custMap[name].txs.push({ date, vehicle, product, qty, unitPrice, amount, taxType: r[17] || '과세' });
    } else {
      custMap[name].totalOther += amount;
    }
  });

  for (const vendor of Object.values(custMap)) {
    // ── 검증 1: 업체 내 일별 유종별 단가 불일치 (휘발유/경유/등유만) ──
    // 같은 업체, 같은 날, 같은 유종에서 단가가 2종 이상이면 오류
    const FUEL_PRODUCTS = new Set(['휘발유', '경유', '등유']);
    const vendorDailyPrices = {}; // "date|product" → Set<unitPrice>
    for (const tx of vendor._allTxs) {
      if (!tx.unitPrice || !FUEL_PRODUCTS.has(tx.product)) continue;
      const key = `${tx.date}|${tx.product}`;
      if (!vendorDailyPrices[key]) vendorDailyPrices[key] = new Set();
      vendorDailyPrices[key].add(tx.unitPrice);
    }
    for (const [key, prices] of Object.entries(vendorDailyPrices)) {
      if (prices.size > 1) {
        const [date, product] = key.split('|');
        vendor.errors.push({
          type:    'price',
          date,
          product,
          prices:  [...prices].sort((a, b) => a - b),
        });
        vendor.hasError = true;
      }
    }

    // ── 검증 2: 동일 날짜 + 차번호 + 주유량 중복 (휘발유/경유/등유만) ──
    const dupMap = {};
    for (const tx of vendor._allTxs) {
      if (!tx.vehicle || !FUEL_PRODUCTS.has(tx.product)) continue;
      const key = `${tx.date}|${tx.vehicle}|${tx.qty}`;
      if (!dupMap[key]) dupMap[key] = { count: 0, product: tx.product, qty: tx.qty };
      dupMap[key].count++;
    }
    for (const [key, info] of Object.entries(dupMap)) {
      if (info.count > 1) {
        const [date, vehicle] = key.split('|');
        vendor.errors.push({
          type:    'duplicate',
          date,
          vehicle,
          qty:     info.qty,
          product: info.product,
          count:   info.count,
        });
        vendor.hasError = true;
      }
    }

    delete vendor._allTxs;
  }

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
