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

  const dateMap = {};

  valid.forEach(r => {
    const dateStr = String(r[2] || '').trim().split(/\s+/)[0]; // "2026-05-31   23:23:06" → "2026-05-31"
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return;

    if (!dateMap[dateStr]) {
      dateMap[dateStr] = {
        date:            dateStr,
        totalAmount:     0,
        totalFee:        0,
        totalNet:        0,
        count:           0,
        depositDate:     '',
        cardTxs:         [],
        depositExpected: {},
        _depositDates:   new Set(),
      };
    }

    const day    = dateMap[dateStr];
    const amount = Number(r[11]) || 0;
    day.totalAmount += amount;
    day.totalFee    += Number(r[21]) || 0;
    day.totalNet    += Number(r[22]) || 0;
    day.count       += 1;

    const dep = String(r[16] || '').trim();
    if (dep && !dep.match(/^\s*-/)) day._depositDates.add(dep);

    // 카드 거래 수집 (BOS 대사용) — 매입카드사(r[9]) 기준으로 BOS와 비교
    const approvalNo = String(r[13] || '').trim();
    if (approvalNo) {
      day.cardTxs.push({
        approvalNo,
        cardCompany: String(r[9] || '').trim(),  // 매입카드사 (BOS 카드사와 동일 기준)
        cardNo:      String(r[6] || '').trim().replace(/\s+/g, ''),
        fuel:        String(r[5] || '').trim(),
        amount,
      });
    }

    // 입금예정일 × 카드사별 예정금액 집계
    if (dep && !dep.match(/^\s*-/)) {
      const cardCo = normalizeCardName(String(r[9] || '').trim()); // 매입카드사
      if (!cardCo) return;
      const net = Number(r[22]) || 0;
      if (!day.depositExpected[dep]) day.depositExpected[dep] = {};
      day.depositExpected[dep][cardCo] = (day.depositExpected[dep][cardCo] || 0) + net;
    }
  });

  // _depositDates 임시 필드 정리 및 depositDate 설정
  const result = Object.values(dateMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(day => {
      day.depositDate = [...day._depositDates].sort()[0] || '';
      delete day._depositDates;
      return day;
    });

  return result;
}

module.exports = { parseEasyshop };
