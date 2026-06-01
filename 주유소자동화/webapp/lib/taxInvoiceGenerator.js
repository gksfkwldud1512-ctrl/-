'use strict';
const XLSX = require('xlsx');
const path = require('path');

const SUPPLIER = {
  bizNo:   '3038164391',
  name:    '(주)미소주유소',
  ceo:     '신정자',
  address: '충북 음성군 대소면 대금로 199',
  bizType: '도매및소매업',
  bizItem: '주유소',
  email:   'sjj03055@naver.com',
};

function fmtDate(issueDate) {
  return String(issueDate).replace(/[-/]/g, '');
}

function calcProducts(vendor) {
  const map = {};
  (vendor.txs || []).forEach(t => {
    if (!map[t.product]) map[t.product] = { qty: 0, supply: 0, tax: 0 };
    const supply = t.taxType === '면세' ? t.amount : Math.round(t.amount / 1.1);
    const tax    = t.taxType === '면세' ? 0        : t.amount - supply;
    map[t.product].qty    += t.qty;
    map[t.product].supply += supply;
    map[t.product].tax    += tax;
  });
  return Object.entries(map).map(([name, d]) => ({ name, ...d }));
}

function buildDataRow(issueDate, customer, products) {
  const totalSupply = products.reduce((s, p) => s + p.supply, 0);
  const totalTax    = products.reduce((s, p) => s + p.tax,    0);

  const row = [
    '01',
    fmtDate(issueDate),
    SUPPLIER.bizNo,
    '',
    SUPPLIER.name,
    SUPPLIER.ceo,
    SUPPLIER.address,
    SUPPLIER.bizType,
    SUPPLIER.bizItem,
    SUPPLIER.email,
    (customer.bizNo || '').replace(/-/g, ''),
    '',
    customer.name    || '',
    customer.contactName || '',
    customer.address || '',
    customer.bizType || '',
    customer.bizItem || '',
    customer.email   || '',
    '',
    totalSupply,
    totalTax,
    '',
  ];

  for (let i = 0; i < 4; i++) {
    const p = products[i];
    if (p) {
      row.push('', p.name, '', p.qty, '', p.supply, p.tax, '');
    } else {
      row.push('', '', '', '', '', '', '', '');
    }
  }

  row.push('', '', '', '', '02');
  return row;
}

function generateTaxInvoiceExcel(vendors, customers, issueDate, taxMethods, outputDir) {
  const headerRows = [
    ['엑셀 업로드 양식(전자세금계산서-일반(영세율))'],
    ['★주황색으로 표시된 부분은 필수입력항목으로 반드시 입력하셔야 합니다.\n★아래 \'항목설명\' 시트를 참고하여 작성하시기 바랍니다.'],
    ['★실제 업로드할 DATA는 7행부터 입력하여야 합니다. 최대 100건까지 입력이 가능하나, 발급은 최대 10건씩 처리가 됩니다.(100건 초과 자료는 처리 안됨)\n★임의로 행을 추가하거나 삭제하는 경우 파일을 제대로 읽지 못하는 경우가 있으므로, 주어진 양식안에 반드시 작성을 하시기 바랍니다.'],
    ['★전자(세금)계산서 종류는 엑셀 업로드 양식에 따라 해당 전자(세금)계산서 종류코드를 반드시 입력하셔야 합니다.\n★품목은 1건이상 입력해야 합니다.\n★공급받는자 등록번호는 사업자등록번호, 주민등록번호를 입력할 수 있습니다. \n   외국인인 경우 \'9999999999999\'를 입력하시고, 비고란에  외국인등록번호 또는 여권번호를 입력하시기 바랍니다.'],
    [],
    [
      '전자(세금)계산서 종류\n(01:일반, 02:영세율)', '작성일자',
      '공급자 등록번호\n("-" 없이 입력)', '공급자\n 종사업장번호', '공급자 상호', '공급자 성명', '공급자 사업장주소', '공급자 업태', '공급자 종목', '공급자 이메일',
      '공급받는자 등록번호\n("-" 없이 입력)', '공급받는자 \n종사업장번호', '공급받는자 상호', '공급받는자 성명', '공급받는자 사업장주소', '공급받는자 업태', '공급받는자 종목', '공급받는자 이메일1', '공급받는자 이메일2',
      '공급가액', '세액', '비고',
      '일자1\n(2자리, 작성년월 제외)', '품목1', '규격1', '수량1', '단가1', '공급가액1', '세액1', '품목비고1',
      '일자2\n(2자리, 작성년월 제외)', '품목2', '규격2', '수량2', '단가2', '공급가액2', '세액2', '품목비고2',
      '일자3\n(2자리, 작성년월 제외)', '품목3', '규격3', '수량3', '단가3', '공급가액3', '세액3', '품목비고3',
      '일자4\n(2자리, 작성년월 제외)', '품목4', '규격4', '수량4', '단가4', '공급가액4', '세액4', '품목비고4',
      '현금', '수표', '어음', '외상미수금', '영수(01),\n청구(02)',
    ],
  ];

  const dataRows = [];
  const skipped  = [];

  for (const vendor of vendors) {
    if (!vendor.hasCredit) continue;
    const customer = customers.find(c => c.name === vendor.name) || { name: vendor.name };
    if (!customer.bizNo) { skipped.push(vendor.name); continue; }

    const products = calcProducts(vendor);
    if (!products.length) continue;

    const method = taxMethods[vendor.name] || '합산';

    if (method === '분리') {
      for (const p of products) {
        dataRows.push(buildDataRow(issueDate, customer, [p]));
      }
    } else {
      // 합산: 4개 초과 시 4개씩 분할 (각 행 = 1장 세금계산서)
      for (let i = 0; i < products.length; i += 4) {
        dataRows.push(buildDataRow(issueDate, customer, products.slice(i, i + 4)));
      }
    }
  }

  const allRows = [...headerRows, ...dataRows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(allRows);
  XLSX.utils.book_append_sheet(wb, ws, '엑셀업로드양식');

  const ym = fmtDate(issueDate).slice(0, 6);
  const filename = `세금계산서_일괄발행_${ym}.xlsx`;
  XLSX.writeFile(wb, path.join(outputDir, filename));

  return { filename, count: dataRows.length, skipped };
}

module.exports = { generateTaxInvoiceExcel, calcProducts };
