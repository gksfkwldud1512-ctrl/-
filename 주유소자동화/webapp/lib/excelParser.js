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

// BOS "판매전표 상세조회" Excel 파싱
// 컬럼: r[1]=판매일자, r[3]=고객번호, r[4]=고객명, r[6]=주유대상물(차량번호),
//        r[8]=결제구분, r[11]=제품명, r[12]=판매수량, r[13]=판매단가, r[14]=판매금액,
//        r[15]=출고형태("배달"/"스탠드"), r[17]=면세구분
function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    .slice(3)
    .filter(r => r[0] != null);

  const custMap = {};
  const fuelSummary = {};  // { 'YYYY/MM/DD': { '휘발유': {qty, amount}, ... } }
  const FUEL_SET = new Set(['휘발유', '경유', '등유']);

  rows.forEach(r => {
    const name = r[4];
    if (!name) return;

    const payType   = String(r[8] || '').trim();
    const amount    = r[14] || 0;
    const isCredit  = payType === '외상';
    const date      = parseDate(r[1]);
    // 차량번호가 있으면 그대로 유지, 없고 출고형태가 "배달"이면 "배달" 표시
    const rawVehicle = String(r[6] || '').trim();
    const outType    = String(r[15] || '').trim();
    const vehicle    = rawVehicle || (outType === '배달' ? '배달' : '');
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
      const isDelivery = outType === '배달';
      custMap[name].txs.push({ date, vehicle, product, qty, unitPrice, amount, taxType: r[17] || '과세', isDelivery });
    } else {
      custMap[name].totalOther += amount;
    }

    // 월별 유종별 판매 집계 (ALL 거래, 영업이익 계산용)
    if (date && amount > 0) {
      const prod = FUEL_SET.has(product) ? product
                 : product === '세차' ? '세차' : '유외상품';
      if (!fuelSummary[date]) fuelSummary[date] = {};
      if (!fuelSummary[date][prod]) fuelSummary[date][prod] = { qty: 0, amount: 0 };
      fuelSummary[date][prod].qty    += qty    || 0;
      fuelSummary[date][prod].amount += amount;
    }
  });

  for (const vendor of Object.values(custMap)) {
    // ── 검증 1: 업체 내 일별 유종별 단가 불일치 (휘발유/경유/등유만) ──
    const FUEL_PRODUCTS = new Set(['휘발유', '경유', '등유']);
    const vendorDailyPrices = {};
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

    // ── 검증 2: 동일 날짜 + 차번호 + 주유량 중복 (실제 차량번호만, 배달 제외) ──
    const dupMap = {};
    for (const tx of vendor._allTxs) {
      if (!tx.vehicle || tx.vehicle === '배달' || !FUEL_PRODUCTS.has(tx.product)) continue;
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

  return {
    vendors: Object.values(custMap).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    fuelSummary,
  };
}

// 배달판매전표리스트 Excel 파싱 (별도 배달 리포트 형식)
// 컬럼: r[1]=판매일자, r[6]=결제구분, r[7]=고객코드, r[8]=고객명,
//        r[11]=제품명, r[12]=판매수량, r[13]=판매단가, r[14]=판매금액, r[19]=과면세
function parseDeliveryExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
    .slice(3)
    .filter(r => r[8]);  // 고객명(r[8])이 있는 행만

  const custMap = {};

  rows.forEach(r => {
    const name = String(r[8]).trim();
    if (!name) return;

    const payType   = String(r[6] || '').trim();
    const amount    = r[14] || 0;
    const isCredit  = payType === '외상';
    const date      = parseDate(r[1]);
    const product   = r[11] || '경유';
    const qty       = r[12] || 0;
    const unitPrice = r[13] || 0;
    const taxType   = String(r[19] || '과세').trim();

    if (!custMap[name]) {
      custMap[name] = {
        name,
        no:          String(r[7] || ''),
        totalCredit: 0,
        totalOther:  0,
        total:       0,
        hasCredit:   false,
        txs:         [],
        errors:      [],
        hasError:    false,
      };
    }

    custMap[name].total += amount;

    if (isCredit) {
      custMap[name].totalCredit += amount;
      custMap[name].hasCredit    = true;
      const rawVehicle = String(r[9] || '').trim();  // 배달 Excel r[9]=차량번호
      const vehicle    = rawVehicle || '배달';
      custMap[name].txs.push({ date, vehicle, product, qty, unitPrice, amount, taxType });
    } else {
      custMap[name].totalOther += amount;
    }
  });

  return Object.values(custMap).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// 일반 Excel → JSON 변환 (고객 등록 양식 등 범용)
function parseExcelRows(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const ws = sheetName && wb.Sheets[sheetName]
    ? wb.Sheets[sheetName]
    : wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

module.exports = { parseExcel, parseDeliveryExcel, parseExcelRows };
