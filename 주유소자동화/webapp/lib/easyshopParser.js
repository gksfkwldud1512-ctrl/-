'use strict';
const XLSX = require('xlsx');
const { normalizeCardName } = require('./bankParser');
const { readWorkbookAuto } = require('./xlsxReader');

// 나이스정보통신(구 이지샵) 매출자료 헤더명 → 필요 컬럼 매핑
// 기존에는 컬럼 위치(인덱스)를 그대로 고정해서 읽었는데, VAN사가 나중에
// 컬럼 순서를 바꾸면 조용히 엉뚱한 값을 읽는 문제가 있어 헤더명으로 먼저 찾고,
// 못 찾으면 지금까지 써오던 고정 인덱스로 폴백한다.
const HEADER_FALLBACK = {
  approvalUid:  0,  // 거래고유번호
  transDate:    2,  // 거래일시
  fuel:         5,  // 유종
  cardNo:       6,  // 카드번호
  buyerCard:    9,  // 매입카드사
  amount:       11, // 금액
  approvalNo:   13, // 승인번호
  depositDate:  16, // 입금예정일
  approvalResult: 17, // 승인결과
  fee:          21, // 수수료
  netDeposit:   22, // 입금예정금액
  canceled:     24, // 취소여부
};

const HEADER_NAME = {
  approvalUid:    '거래고유번호',
  transDate:      '거래일시',
  fuel:           '유종',
  cardNo:         '카드번호',
  buyerCard:      '매입카드사',
  amount:         '금액',
  approvalNo:     '승인번호',
  depositDate:    '입금예정일',
  approvalResult: '승인결과',
  fee:            '수수료',
  netDeposit:     '입금예정금액',
  canceled:       '취소여부',
};

// 헤더에 정렬 화살표(▼▲ 등)가 붙어 나오는 경우가 있어 비교 전에 제거
function normalizeHeader(h) {
  return String(h || '').trim().replace(/[▼▲△▽◀▶\s]+$/g, '').trim();
}

function resolveColumns(headerRow) {
  const col = {};
  const headers = (headerRow || []).map(normalizeHeader);
  for (const key of Object.keys(HEADER_NAME)) {
    const idx = headers.indexOf(HEADER_NAME[key]);
    col[key] = idx >= 0 ? idx : HEADER_FALLBACK[key];
  }
  return col;
}

async function parseEasyshop(filePath) {
  const wb  = await readWorkbookAuto(filePath);
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 행0: 헤더, 행1~: 데이터
  const col = resolveColumns(raw[0]);
  const dataRows = raw.slice(1).filter(r => r[col.approvalUid]);

  // 정상 승인 + 취소 아닌 건만
  const valid = dataRows.filter(r => r[col.approvalResult] === '정상' && r[col.canceled] === 'N');
  if (!valid.length) throw new Error('정상 카드 거래 내역이 없습니다.');

  const dateMap = {};

  valid.forEach(r => {
    const dateStr = String(r[col.transDate] || '').trim().split(/\s+/)[0]; // "2026-05-31   23:23:06" → "2026-05-31"
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
    const amount = Number(r[col.amount]) || 0;
    day.totalAmount += amount;
    day.totalFee    += Number(r[col.fee]) || 0;
    day.totalNet    += Number(r[col.netDeposit]) || 0;
    day.count       += 1;

    const dep = String(r[col.depositDate] || '').trim();
    if (dep && !dep.match(/^\s*-/)) day._depositDates.add(dep);

    // 카드 거래 수집 (BOS 대사용) — 매입카드사 기준으로 BOS와 비교
    const approvalNo = String(r[col.approvalNo] || '').trim();
    if (approvalNo) {
      const timePart = String(r[col.transDate] || '').trim().split(/\s+/)[1] || '';
      day.cardTxs.push({
        approvalNo,
        cardCompany: String(r[col.buyerCard] || '').trim(),
        cardNo:      String(r[col.cardNo] || '').trim().replace(/\s+/g, ''),
        fuel:        String(r[col.fuel] || '').trim(),
        amount,
        transTime:   timePart,
      });
    }

    // 입금예정일 × 카드사별 예정금액 집계
    if (dep && !dep.match(/^\s*-/)) {
      const cardCo = normalizeCardName(String(r[col.buyerCard] || '').trim()); // 매입카드사
      if (!cardCo) return;
      const net = Number(r[col.netDeposit]) || 0;
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
