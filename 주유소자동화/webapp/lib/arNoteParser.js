'use strict';

// 통장 "비고" 컬럼에 담당자가 직접 적어둔 힌트를 해석한다.
// 순수 텍스트 파싱만 담당 — 업체 목록/별칭 지식은 arLedger.js 쪽에서 결합한다.

// 비고에서 월(1~12) 숫자만 추출. 실패 시 null.
//   1순위: "N월" — "5월", "1월꺼", "중앙복층6월", "6월 노사 TFT"
//   2순위: "N/D" 날짜표기 — "4/13", "3/17 주유분", "3/12-15" (앞의 N만 사용)
function extractMonthNumber(note) {
  const s = String(note || '');

  let m = s.match(/(\d{1,2})\s*월/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 12) return n;
  }

  m = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (m) {
    const mo = Number(m[1]), day = Number(m[2]);
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return mo;
  }

  return null;
}

// 비고 + 입금일자(YYYY-MM-DD) → 대상월(YYYY-MM). 추출 월이 입금월보다 크면
// 전년도로 보정(예: 1월 입금인데 비고가 "12월"이면 작년 12월). 실패 시 null.
function extractMonthHint(note, depositDateStr) {
  const n = extractMonthNumber(note);
  if (!n) return null;
  const depositYear  = Number(String(depositDateStr).slice(0, 4));
  const depositMonth = Number(String(depositDateStr).slice(5, 7));
  if (!depositYear || !depositMonth) return null;
  const year = n > depositMonth ? depositYear - 1 : depositYear;
  return `${year}-${String(n).padStart(2, '0')}`;
}

// "금액 + 업체명조각 + 포함" 단일 패턴만 시도 (실사용 빈도가 낮아 다중 분할은 지원 안 함).
// 예: "6월 2,380,128 명신포함" → { amount: 2380128, fragment: '명신' }
function extractSplitHint(note) {
  const s = String(note || '');
  const m = s.match(/([\d][\d,]{2,})\s*원?\s*([가-힣a-zA-Z0-9]{1,10}?)\s*포함/);
  if (!m) return null;
  const amount = parseInt(m[1].replace(/,/g, ''), 10);
  const fragment = m[2].trim();
  if (!amount || !fragment) return null;
  return { amount, fragment };
}

module.exports = { extractMonthNumber, extractMonthHint, extractSplitHint };
