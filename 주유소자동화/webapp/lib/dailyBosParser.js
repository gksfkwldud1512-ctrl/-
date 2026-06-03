'use strict';
const XLSX = require('xlsx');

const FUEL_TYPES = new Set(['휘발유', '경유', '등유']);
const CAR_WASH   = '세차';

function parseBosDaily(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const raw  = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 행3부터 데이터 (행0=타이틀, 행1=날짜범위, 행2=헤더)
  const dataRows = raw.slice(3).filter(r => r[1]);

  const dateMap = {};

  dataRows.forEach(r => {
    const dateStr = String(r[1] || '').trim();
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return;

    if (!dateMap[dateStr]) {
      dateMap[dateStr] = {
        date:    dateStr,
        fuels:   { '휘발유': { qty: 0, amount: 0 }, '경유': { qty: 0, amount: 0 }, '등유': { qty: 0, amount: 0 } },
        carwash: { amount: 0 },
        others:  { amount: 0 },
        byPay:   { '현금': 0, '신용카드': 0, '외상': 0 },
        cardTxs: [],
      };
    }

    const day     = dateMap[dateStr];
    const product = String(r[11] || '').trim();
    const payType = String(r[6]  || '').trim();
    const qty     = Number(r[12]) || 0;
    const amount  = Number(r[14]) || 0;

    if (FUEL_TYPES.has(product)) {
      day.fuels[product].qty    += qty;
      day.fuels[product].amount += amount;
    } else if (product === CAR_WASH) {
      day.carwash.amount += amount;
    } else {
      day.others.amount += amount;
    }

    if (payType === '현금')         day.byPay['현금']     += amount;
    else if (payType === '신용카드') day.byPay['신용카드'] += amount;
    else if (payType === '외상')    day.byPay['외상']      += amount;

    if (payType === '신용카드') {
      const approvalNo = String(r[16] || '').trim();
      if (approvalNo) {
        day.cardTxs.push({
          approvalNo,
          cardCompany: String(r[15] || '').trim(),
          cardNo:      bosCardNo(String(r[23] || '')),
          product,
          amount,
        });
      }
    }
  });

  return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
}

function bosCardNo(raw) {
  const m = raw.match(/(\d{4})[A-Z]+$/);
  return m ? `****${m[1]}` : raw.slice(-8);
}

module.exports = { parseBosDaily };
