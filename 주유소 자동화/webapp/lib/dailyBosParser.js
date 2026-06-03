'use strict';
const XLSX = require('xlsx');

const FUEL_TYPES = new Set(['휘발유', '경유', '등유']);
const CAR_WASH   = '세차';

function parseBosDaily(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const raw  = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 행1: "판매기간: 20260505 ~ 20260505   결제구분: 전체"
  const headerStr  = String(raw[1]?.[0] || '');
  const dateMatch  = headerStr.match(/(\d{8})/);
  if (!dateMatch) throw new Error('날짜를 인식할 수 없습니다. BOS 파일을 확인하세요.');
  const d    = dateMatch[1];
  const date = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;

  const dataRows = raw.slice(3).filter(r => r[1]);

  const fuels = {
    '휘발유': { qty: 0, amount: 0 },
    '경유':   { qty: 0, amount: 0 },
    '등유':   { qty: 0, amount: 0 },
  };
  const carwash = { amount: 0 };  // 세차: 원가 없음
  const others  = { amount: 0 };  // 유외상품: 수기 원가 입력
  const byPay   = { '현금': 0, '신용카드': 0, '외상': 0 };

  const cardTxs = [];

  dataRows.forEach(r => {
    const product = String(r[11] || '').trim();
    const payType = String(r[6]  || '').trim();
    const qty     = Number(r[12]) || 0;
    const amount  = Number(r[14]) || 0;

    if (FUEL_TYPES.has(product)) {
      fuels[product].qty    += qty;
      fuels[product].amount += amount;
    } else if (product === CAR_WASH) {
      carwash.amount += amount;
    } else {
      others.amount += amount;
    }

    if (payType === '현금')         byPay['현금']     += amount;
    else if (payType === '신용카드') byPay['신용카드'] += amount;
    else if (payType === '외상')    byPay['외상']      += amount;

    // 신용카드 거래 수집 (매칭용)
    if (payType === '신용카드') {
      const approvalNo = String(r[16] || '').trim();
      if (approvalNo) {
        cardTxs.push({
          approvalNo,
          cardCompany: String(r[15] || '').trim(),
          cardNo:      bosCardNo(String(r[23] || '')),
          product,
          amount,
        });
      }
    }
  });

  return { date, fuels, carwash, others, byPay, cardTxs };
}

// BOS 카드번호에서 표시용 마스킹 추출
// "525982******8044WN" → "****8044"
function bosCardNo(raw) {
  const m = raw.match(/(\d{4})[A-Z]+$/);
  return m ? `****${m[1]}` : raw.slice(-8);
}

module.exports = { parseBosDaily };
