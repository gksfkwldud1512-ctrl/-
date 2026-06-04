'use strict';
const XLSX = require('xlsx');

const FUEL_TYPES = new Set(['휘발유', '경유', '등유']);
const CAR_WASH   = '세차';

// 두 가지 BOS 파일 형식 자동 감지
// 형식 A (판매전표/거래내역):    r[6]=결제구분, r[15]=카드사, r[16]=승인번호, r[20]=출고구분, r[23]=카드번호
// 형식 B (상세거래내역 1-6월):   r[8]=결제구분, r[20]=카드사, r[21]=승인번호, r[15]=출고형태
function detectFormat(headerRow) {
  const h6 = String(headerRow[6] || '').trim();
  if (h6 === '결제구분') {
    return { payTypeCol: 6, cardCoCol: 15, approvalCol: 16, outTypeCol: 20, cardNoCol: 23 };
  }
  // 형식 B
  return { payTypeCol: 8, cardCoCol: 20, approvalCol: 21, outTypeCol: 15, cardNoCol: -1 };
}

function parseBosDaily(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const raw  = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const fmt      = detectFormat(raw[2] || []);
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
    const payType = String(r[fmt.payTypeCol] || '').trim();
    const qty     = Number(r[12]) || 0;
    const amount  = Number(r[14]) || 0;

    // amount=0 이고 qty>0 인 트랜잭션 제외 (배달/기타 무상공급 등)
    if (qty > 0 && amount === 0) return;

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
      const approvalNo = String(r[fmt.approvalCol] || '').trim();
      if (approvalNo) {
        const cardNo = fmt.cardNoCol >= 0 ? bosCardNo(String(r[fmt.cardNoCol] || '')) : '';
        day.cardTxs.push({
          approvalNo,
          cardCompany: String(r[fmt.cardCoCol] || '').trim(),
          cardNo,
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
