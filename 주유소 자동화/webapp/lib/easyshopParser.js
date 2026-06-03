'use strict';
const XLSX = require('xlsx');
const { normalizeCardName } = require('./bankParser');

function parseEasyshop(filePath) {
  const wb  = XLSX.readFile(filePath);
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 행0: 헤더, 행1~: 데이터
  const dataRows = raw.slice(1).filter(r => r[0]);

  // 정상 승인 + 취소 아닌 건만
  const valid = dataRows.filter(r => r[17] === '정상' && r[24] === 'N');
  if (!valid.length) throw new Error('정상 카드 거래 내역이 없습니다.');

  // 날짜: 거래일시(index 2) "2026-05-05   23:15:08"
  const date = String(valid[0][2] || '').trim().split(/\s+/)[0];

  let totalAmount = 0, totalFee = 0, totalNet = 0;
  const depositDates = new Set();
  const cardTxs = [];

  valid.forEach(r => {
    const amount = Number(r[11]) || 0;
    totalAmount += amount;
    totalFee    += Number(r[21]) || 0;
    totalNet    += Number(r[22]) || 0;
    const dep = String(r[16] || '').trim();
    if (dep && dep !== '-  -  ') depositDates.add(dep);

    // 카드 거래 수집 (매칭용)
    const approvalNo = String(r[13] || '').trim();
    if (approvalNo) {
      cardTxs.push({
        approvalNo,
        cardCompany: String(r[8] || '').trim(),
        cardNo:      String(r[6] || '').trim().replace(/\s+/g, ''),
        fuel:        String(r[5] || '').trim(),
        amount,
      });
    }
  });

  // 입금예정일 × 카드사별 예정금액 집계
  // { "2026-05-08": { "신한카드": 9637628, ... } }
  const depositExpected = {};
  valid.forEach(r => {
    const dep     = String(r[16] || '').trim();
    if (!dep || dep === '-  -  ') return;
    const cardCo  = normalizeCardName(String(r[9] || '').trim()); // 매입카드사
    if (!cardCo) return;
    const net     = Number(r[22]) || 0;
    if (!depositExpected[dep]) depositExpected[dep] = {};
    depositExpected[dep][cardCo] = (depositExpected[dep][cardCo] || 0) + net;
  });

  return {
    date,
    totalAmount,
    totalFee,
    totalNet,
    count: valid.length,
    depositDate: [...depositDates].sort()[0] || '',
    cardTxs,
    depositExpected,
  };
}

module.exports = { parseEasyshop };
