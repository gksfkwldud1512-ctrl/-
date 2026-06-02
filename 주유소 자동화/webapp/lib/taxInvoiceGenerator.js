'use strict';
const XLSX = require('xlsx');
const path = require('path');
const fs   = require('fs');

const SUPPLIER = {
  bizNo:   '3038164391',
  name:    '(주)미소주유소',
  ceo:     '신정자',
  address: '충북 음성군 대소면 대금로 199',
  bizType: '도매및소매업',
  bizItem: '주유소',
  email:   'sjj03055@naver.com',
};

const FUEL_PRODUCTS = new Set(['휘발유', '경유', '등유']);

function fmtDate(issueDate) {
  return String(issueDate).replace(/[-/]/g, '');
}

// 발행일자에서 일(day) 2자리 추출 — 홈택스 양식의 일자N 필드
function getDay(issueDate) {
  return fmtDate(issueDate).slice(6, 8);
}

function calcProducts(vendor) {
  const fuelMap = {};
  let nonFuelSupply = 0, nonFuelTax = 0;

  (vendor.txs || []).forEach(t => {
    const supply = t.taxType === '면세' ? t.amount : Math.round(t.amount / 1.1);
    const tax    = t.taxType === '면세' ? 0        : t.amount - supply;
    const qty    = Math.floor(t.qty);

    if (FUEL_PRODUCTS.has(t.product)) {
      if (!fuelMap[t.product]) fuelMap[t.product] = { qty: 0, supply: 0, tax: 0 };
      fuelMap[t.product].qty    += qty;
      fuelMap[t.product].supply += supply;
      fuelMap[t.product].tax    += tax;
    } else {
      nonFuelSupply += supply;
      nonFuelTax    += tax;
    }
  });

  const result = Object.entries(fuelMap).map(([name, d]) => ({ name, ...d }));
  if (nonFuelSupply > 0) {
    result.push({ name: '유외상품', qty: '', supply: nonFuelSupply, tax: nonFuelTax });
  }
  return result;
}

// 홈택스 엑셀 양식 데이터 행 1건 생성 (총 59열)
function buildDataRow(issueDate, customer, products) {
  const totalSupply = products.reduce((s, p) => s + p.supply, 0);
  const totalTax    = products.reduce((s, p) => s + p.tax,    0);
  const day = getDay(issueDate);  // 일자N 필드: 2자리 일

  // A~V: 공급자/공급받는자/합계 (22열)
  const row = [
    '01',                                          // A: 전자세금계산서 종류 (일반)
    fmtDate(issueDate),                            // B: 작성일자 (YYYYMMDD)
    SUPPLIER.bizNo,                                // C: 공급자 등록번호 ("-" 없이)
    '',                                            // D: 공급자 종사업장번호
    SUPPLIER.name,                                 // E: 공급자 상호
    SUPPLIER.ceo,                                  // F: 공급자 성명
    SUPPLIER.address,                              // G: 공급자 사업장주소
    SUPPLIER.bizType,                              // H: 공급자 업태
    SUPPLIER.bizItem,                              // I: 공급자 종목
    SUPPLIER.email,                                // J: 공급자 이메일
    (customer.bizNo || '').replace(/-/g, ''),      // K: 공급받는자 등록번호 ("-" 없이)
    '',                                            // L: 공급받는자 종사업장번호
    customer.name        || '',                    // M: 공급받는자 상호
    customer.contactName || '',                    // N: 공급받는자 성명
    customer.address     || '',                    // O: 공급받는자 사업장주소
    customer.bizType     || '',                    // P: 공급받는자 업태
    customer.bizItem     || '',                    // Q: 공급받는자 종목
    customer.email       || '',                    // R: 공급받는자 이메일1
    '',                                            // S: 공급받는자 이메일2
    totalSupply,                                   // T: 공급가액합계
    totalTax,                                      // U: 세액합계
    '',                                            // V: 비고
  ];

  // W~BF: 품목 1~4 (각 8열: 일자, 품목, 규격, 수량, 단가, 공급가액, 세액, 품목비고)
  for (let i = 0; i < 4; i++) {
    const p = products[i];
    if (p) {
      const unitPrice = (p.qty && p.qty > 0) ? Math.round(p.supply / p.qty) : '';
      row.push(
        day,          // 일자N (2자리)
        p.name,       // 품목N
        '',           // 규격N
        p.qty,        // 수량N
        unitPrice,    // 단가N
        p.supply,     // 공급가액N
        p.tax,        // 세액N
        '',           // 품목비고N
      );
    } else {
      row.push('', '', '', '', '', '', '', '');
    }
  }

  // BG~BK: 현금, 수표, 어음, 외상미수금, 영수/청구
  row.push('', '', '', '', '02');  // 02 = 청구 (외상 업체이므로)
  return row;
}

function generateTaxInvoiceExcel(vendors, customers, issueDate, taxMethods, outputDir) {
  // ── 템플릿 파일을 베이스로 사용 (서식/색상/시트 구조 보존) ──────
  const templatePath = path.join(outputDir, '..', '세금계산서등록양식(일반).xlsx');

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      '템플릿 파일이 없습니다: 세금계산서등록양식(일반).xlsx\n' +
      'webapp 폴더에 해당 파일을 넣어주세요.'
    );
  }

  const wb = XLSX.readFile(templatePath);
  const ws = wb.Sheets['엑셀업로드양식'];
  if (!ws) throw new Error('템플릿 파일에 "엑셀업로드양식" 시트가 없습니다.');

  // ── 데이터 행 생성 ────────────────────────────────────────────
  const dataRows = [];
  const skipped  = [];
  const selectedNames = Object.keys(taxMethods);

  for (const vendor of vendors) {
    if (!vendor.hasCredit) continue;
    if (!selectedNames.includes(vendor.name)) continue;

    const customer = customers.find(c => c.name === vendor.name) || { name: vendor.name };
    if (!customer.bizNo) { skipped.push(vendor.name); continue; }

    const products = calcProducts(vendor);
    if (!products.length) continue;

    const method = taxMethods[vendor.name];

    if (method === '분리') {
      // 유종별 각 1장
      for (const p of products) {
        dataRows.push(buildDataRow(issueDate, customer, [p]));
      }
    } else {
      // 합산 (4개 초과 시 4개씩 분할)
      for (let i = 0; i < products.length; i += 4) {
        dataRows.push(buildDataRow(issueDate, customer, products.slice(i, i + 4)));
      }
    }
  }

  // ── 데이터를 row 7(index 6)부터 삽입 ─────────────────────────
  if (dataRows.length > 0) {
    XLSX.utils.sheet_add_aoa(ws, dataRows, { origin: 'A7' });
  }

  // ── 저장 ─────────────────────────────────────────────────────
  const ym = fmtDate(issueDate).slice(0, 6);
  const filename = `세금계산서_일괄발행_${ym}.xlsx`;
  XLSX.writeFile(wb, path.join(outputDir, filename));

  return { filename, count: dataRows.length, skipped };
}

module.exports = { generateTaxInvoiceExcel, calcProducts };
