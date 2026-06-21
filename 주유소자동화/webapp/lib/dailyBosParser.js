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

// BOS 판매전표 → 고객별 월별 판매 집계
// 형식 감지:
//   판매전표 상세조회: h2[4]='고객명', h2[8]='결제구분' → custCol=4, payCol=8, prodCol=11, qtyCol=12, priceCol=13, amtCol=14
//   판매전표리스트:     h2[8]='고객명', h2[6]='결제구분' → custCol=8, payCol=6,  prodCol=11, qtyCol=12, priceCol=13, amtCol=14
//   배달판매전표리스트: h2[8]='고객명', h2[6]='결제구분' → custCol=8, payCol=6,  prodCol=11, qtyCol=12, priceCol=13, amtCol=14
function parseCustomerSales(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const raw  = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const h0 = String(raw[0]?.[0] || '').trim();
  const h2 = raw[2] || [];

  // 판매전표 계열만 처리
  if (!h0.includes('판매전표') && !h0.includes('판매전표리스트')) return {};

  // 컬럼 위치 결정
  const h2_4 = String(h2[4] || '').trim();
  const h2_8 = String(h2[8] || '').trim();
  let custCol, payCol, prodCol, qtyCol, priceCol, amtCol, custNoCol;

  if (h2_4 === '고객명') {
    // 판매전표 상세조회
    custCol = 4; custNoCol = 3; payCol = 8;
    prodCol = 11; qtyCol = 12; priceCol = 13; amtCol = 14;
  } else if (h2_8 === '고객명') {
    // 판매전표리스트 / 배달판매전표리스트
    custCol = 8; custNoCol = 7; payCol = 6;
    prodCol = 11; qtyCol = 12; priceCol = 13; amtCol = 14;
  } else {
    return {}; // 알 수 없는 형식
  }

  const dataRows  = raw.slice(3).filter(r => r[1]);
  const monthMap  = {};
  const FUELS     = new Set(['휘발유', '경유', '등유']);

  dataRows.forEach(r => {
    const dateStr = String(r[1] || '').trim();
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return;
    const ym     = dateStr.slice(0, 7);

    const custName  = String(r[custCol] || '').trim() || '알수없음';
    const custNo    = String(r[custNoCol] || '').trim();
    const payType   = String(r[payCol] || '').trim();
    const product   = String(r[prodCol] || '').trim();
    const qty       = Number(r[qtyCol]) || 0;
    const unitPrice = Number(r[priceCol]) || 0;
    const amount    = Number(r[amtCol]) || 0;

    if (qty > 0 && amount === 0) return; // 무상공급 제외

    if (!monthMap[ym]) monthMap[ym] = {};
    const key = `${custName}||${payType}`;
    if (!monthMap[ym][key]) {
      monthMap[ym][key] = {
        name: custName, custNo, payType,
        fuels: {
          '휘발유': { qty: 0, amount: 0, txCount: 0, priceSum: 0 },
          '경유':   { qty: 0, amount: 0, txCount: 0, priceSum: 0 },
          '등유':   { qty: 0, amount: 0, txCount: 0, priceSum: 0 },
        },
        carwash: 0, others: 0,
        totalQty: 0, totalAmount: 0,
      };
    }
    const c = monthMap[ym][key];

    if (FUELS.has(product)) {
      c.fuels[product].qty    += qty;
      c.fuels[product].amount += amount;
      if (unitPrice > 0) { c.fuels[product].priceSum += unitPrice * qty; c.fuels[product].txCount += qty; }
      c.totalQty    += qty;
      c.totalAmount += amount;
    } else if (product === '세차') {
      c.carwash += amount; c.totalAmount += amount;
    } else if (product) {
      c.others  += amount; c.totalAmount += amount;
    }
  });

  // 집계 정리
  const result = {};
  for (const [ym, custMap] of Object.entries(monthMap)) {
    result[ym] = Object.values(custMap).map(c => {
      const fuels = {};
      for (const [fuel, fd] of Object.entries(c.fuels)) {
        fuels[fuel] = {
          qty:      Math.round(fd.qty * 100) / 100,
          amount:   Math.round(fd.amount),
          avgPrice: fd.qty > 0 ? Math.round(fd.amount / fd.qty) : null,
        };
      }
      return {
        name: c.name, custNo: c.custNo, payType: c.payType,
        fuels, carwash: Math.round(c.carwash), others: Math.round(c.others),
        totalQty: Math.round(c.totalQty * 100) / 100,
        totalAmount: Math.round(c.totalAmount),
      };
    }).sort((a, b) => b.totalAmount - a.totalAmount);
  }
  return result;
}

module.exports = { parseBosDaily, parseCustomerSales };
