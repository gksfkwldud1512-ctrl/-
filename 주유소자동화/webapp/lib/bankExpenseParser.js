'use strict';
const XLSX = require('xlsx');

// ── 연료 구매 제외 패턴 ──────────────────────────────────────────
const FUEL_PATTERNS = [
  /현대오일뱅크\(주\)/,
  /하나현대오일뱅크/,
  /에이치디현대오일뱅크주식회사/,
];

// ── 내부 이체 / 대표자·가족 인출 제외 패턴 ─────────────────────
// (기름 구매와 무관한 자금 이동, 대표자 인출 등)
const INTERNAL_PATTERNS = [
  /^주식회사 미소주유소/,
  /^\(주\)미소주유소(?!_음)/,  // (주)미소주유소_음(환경개선부담금)은 제외하지 않음
  /^주식회사미소주유소/,
  /^하나\(주\)미소주유소/,
  /신정자(?!\/급여)/,  // 신정자/급여는 제외하지 않음, 나머지 신정자 인출 제외
  /^기업신정자/,        // 기업신정자 인출 제외
  /이용주/,
  /박미소/,
  /윤광성/,
];

// ── 임대료 예외 패턴 (연료 제외에서 살려야 함) ──────────────────
const RENT_PATTERNS = [
  /충청동부지에이치디현/,
  /충북소매.*에이치디/,
];

// ── 자동 분류 맵 (cat=대분류, sub=소분류, account=계정과목) ──────
const CATEGORY_MAP = [
  { re: /충청동부지에이치디현|충북소매.*에이치디/,        cat: '고정비', sub: '임대료',   account: '임차료' },
  // 급여: 신정자/급여 (대표이사 급여), 직원 급여 이체
  { re: /신정자\/급여/,                                   cat: '고정비', sub: '급여',     account: '급여' },
  { re: /KB카드출금|하나카드기업|하나카드|국민카드|롯데카드|신한카드|삼성카드|현대카드|비씨카드|우리카드|농협카드|카드출금|카드대금/, cat: '고정비', sub: '카드비',   account: '지급수수료' },
  { re: /이자[-_\s]\d+|대출이자|이자관련/,               cat: '고정비', sub: '이자',     account: '이자비용' },
  { re: /한국전력|한전/,                                  cat: '고정비', sub: '전력비',   account: '전력비' },
  { re: /혁신세무|세무회계|세무사/,                       cat: '고정비', sub: '기장비',   account: '지급수수료' },
  { re: /신용보증기금/,                                   cat: '고정비', sub: '신용보증', account: '지급보증료' },
  { re: /국세[-_]|국고[-_].*미소|공과금/,                cat: '고정비', sub: '세금',     account: '세금과공과' },
  // 자동차세: 경찰청 납부분 + (주)미소주유소_음 환경개선부담금
  { re: /경찰청.*미소|자동차세|\(주\)미소주유소_음/,      cat: '고정비', sub: '자동차세', account: '세금과공과' },
  // 유외상품: 바른유통 직접이체 + 정동식(바른유통 대표) 이체
  { re: /바른유통|롯데칠성음료|우림상사|정동식/,          cat: '변동비', sub: '유외상품', account: '상품매입' },
  { re: /에스케이쉴더스|웹케시|아이엠컴|케이티\/|KT\//,  cat: '고정비', sub: '운영비',   account: '통신비' },
  { re: /대소가스/,                                       cat: '고정비', sub: '수도비',   account: '수도광열비' },
  { re: /커피팜스/,                                       cat: '고정비', sub: '커피',     account: '복리후생비' },
  { re: /보험/,                                           cat: '고정비', sub: '보험비',   account: '보험료' },
  { re: /퇴직금|퇴직적립/,                               cat: '변동비', sub: '퇴직금',   account: '퇴직급여' },
  { re: /협회|조합비/,                                   cat: '변동비', sub: '협회비',   account: '조합비' },
  { re: /전기요금/,                                       cat: '고정비', sub: '전력비',   account: '전력비' },
  { re: /급여이체/,                                       cat: '고정비', sub: '급여',     account: '급여' },
];

// ── 과거 지출목록(계정과목 확정된 항목) 기반 자동 매칭 ───────────
// 같은/비슷한 거래처명 또는 동일 금액이 과거 자료에 있으면 그 계정과목을 재사용한다.
function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}

function commonPrefixLen(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

// 두 정규화된 거래처명의 유사도(0~1). 포함 관계 또는 앞부분 일치(일련번호 등 접미 변동) 인식
function vendorSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 3) return 0.9;
  const cp = commonPrefixLen(a, b);
  const ratio = cp / Math.max(a.length, b.length);
  return (cp >= 4 && ratio >= 0.6) ? ratio : 0;
}

/**
 * 과거 지출 목록(이미 계정과목이 정해진 항목들)으로부터 매칭 인덱스를 만든다.
 * @param {Array} history expenses.json 형태의 배열 (subCategory==='기타'인 항목은 참조에서 제외)
 */
function buildHistoryIndex(history) {
  const vendorGroups = new Map();  // norm -> Map(key -> {count,category,subCategory,account,lastDate})
  const amountGroups = new Map();  // amount -> Map(key -> count)

  for (const e of (history || [])) {
    if (!e || !e.vendor || !e.subCategory || e.subCategory === '기타') continue;
    const norm = normalize(e.vendor);
    if (!norm) continue;
    const key = `${e.category || ''}|${e.subCategory}|${e.account || ''}`;

    if (!vendorGroups.has(norm)) vendorGroups.set(norm, new Map());
    const g = vendorGroups.get(norm);
    const cur = g.get(key) || { count: 0, category: e.category, subCategory: e.subCategory, account: e.account || '', lastDate: '' };
    cur.count++;
    if ((e.date || '') > cur.lastDate) cur.lastDate = e.date || '';
    g.set(key, cur);

    if (e.amount != null) {
      if (!amountGroups.has(e.amount)) amountGroups.set(e.amount, new Map());
      const ag = amountGroups.get(e.amount);
      ag.set(key, (ag.get(key) || 0) + 1);
    }
  }

  // 거래처별 대표 계정과목 (가장 많이 쓰인 것, 동률이면 최근 것)
  const vendorMap = new Map();
  for (const [norm, g] of vendorGroups) {
    let best = null;
    for (const val of g.values()) {
      if (!best || val.count > best.count || (val.count === best.count && val.lastDate > best.lastDate)) best = val;
    }
    vendorMap.set(norm, best);
  }

  // 금액별 계정과목 (동일 금액이 항상 같은 계정과목으로만 쓰였을 때만 채택 - 모호하면 제외)
  const amountMap = new Map();
  for (const [amt, g] of amountGroups) {
    if (g.size === 1) {
      const [key] = g.keys();
      const [category, subCategory, account] = key.split('|');
      amountMap.set(amt, { category, subCategory, account });
    }
  }

  return { vendorMap, amountMap };
}

// 거래처명(정규화) 기준 매칭: 정확히 일치 → 유사(포함/접두사 공통) 매칭
function matchVendorHistory(norm, idx) {
  if (!norm || !idx) return null;
  const exact = idx.vendorMap.get(norm);
  if (exact) return exact;

  let best = null, bestScore = 0, ambiguous = false;
  for (const [key, val] of idx.vendorMap) {
    const score = vendorSimilarity(norm, key);
    if (score > bestScore) {
      best = val; bestScore = score; ambiguous = false;
    } else if (score > 0 && score === bestScore && val.subCategory !== best.subCategory) {
      ambiguous = true;
    }
  }
  return (bestScore >= 0.6 && !ambiguous) ? best : null;
}

/**
 * 거래처 계정과목 분류
 * 우선순위: 1) 과거자료 거래처 매칭(정확/유사) 2) 정규식 규칙 3) 과거자료 금액 매칭 4) 기타
 * @param {string} vendor
 * @param {number} amount
 * @param {{vendorMap:Map, amountMap:Map}} [historyIndex] buildHistoryIndex() 결과
 */
function classifyVendor(vendor, amount, historyIndex) {
  if (historyIndex) {
    const vm = matchVendorHistory(normalize(vendor), historyIndex);
    if (vm) return { category: vm.category, subCategory: vm.subCategory, account: vm.account };
  }

  for (const { re, cat, sub, account } of CATEGORY_MAP) {
    if (re.test(vendor)) return { category: cat, subCategory: sub, account };
  }

  if (historyIndex && historyIndex.amountMap.has(amount)) {
    const am = historyIndex.amountMap.get(amount);
    return { category: am.category, subCategory: am.subCategory, account: am.account };
  }

  return { category: '변동비', subCategory: '기타', account: '잡비' };
}

function isRent(vendor) {
  return RENT_PATTERNS.some(re => re.test(vendor));
}

function isFuelPurchase(vendor) {
  return FUEL_PATTERNS.some(re => re.test(vendor));
}

function isInternalTransfer(vendor) {
  return INTERNAL_PATTERNS.some(re => re.test(vendor));
}

/**
 * 수시입출예금 입출금내역.xls 파싱
 * @param {string} filePath
 * @param {Array} [history] 기존 지출목록(expenses.json) — 계정과목 자동 매칭 참조용
 * @returns {{ date:string, month:string, category:string, subCategory:string, vendor:string, amount:number, source:'bank' }[]}
 */
function parseBankExpenses(filePath, history = []) {
  const historyIndex = buildHistoryIndex(history);
  const wb = XLSX.readFile(filePath, { type: 'file', cellDates: true, codepage: 949 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 헤더 행 찾기 (row 0~10)
  let headerIdx = -1;
  let colDate = -1, colVendor = -1, colOut = -1;

  for (let i = 0; i < Math.min(rows.length, 11); i++) {
    const row = rows[i].map(c => String(c).trim());
    const dIdx = row.findIndex(c => c === '거래일자');
    if (dIdx >= 0) {
      headerIdx = i;
      colDate   = dIdx;
      // 적요1: 헤더에서 "적요1" 찾기
      colVendor = row.findIndex(c => c === '적요1');
      // 출금: 헤더에서 "출금" 찾기 (없으면 col 7 fallback)
      colOut    = row.findIndex(c => c === '출금');
      if (colOut < 0) colOut = 7;
      break;
    }
  }

  if (headerIdx < 0) throw new Error('헤더 행(거래일자)을 찾을 수 없습니다.');

  const result = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // 출금 금액
    const rawOut = row[colOut];
    const outAmt = typeof rawOut === 'number' ? rawOut : parseFloat(String(rawOut).replace(/,/g, '')) || 0;
    if (outAmt <= 0) continue;

    // 거래처명(적요1)
    const vendor = String(colVendor >= 0 ? (row[colVendor] || '') : '').trim();
    if (!vendor) continue;

    // 임대료 예외: 연료 패턴에 걸려도 포함
    const isRentRow = isRent(vendor);

    // 연료 구매 제외 (임대료 제외)
    if (!isRentRow && isFuelPurchase(vendor)) continue;

    // 내부 이체 제외
    if (isInternalTransfer(vendor)) continue;

    // 거래일자 파싱
    const rawDate = row[colDate];
    let dateStr = '';
    if (rawDate instanceof Date) {
      // cellDates:true 로 읽었을 때
      const y = rawDate.getFullYear();
      const m = String(rawDate.getMonth() + 1).padStart(2, '0');
      const d = String(rawDate.getDate()).padStart(2, '0');
      dateStr = `${y}-${m}-${d}`;
    } else {
      // 문자열 형태 처리: '2026-01-07', '20260107', '2026/01/07'
      const s = String(rawDate).trim().replace(/[./]/g, '-');
      if (/^\d{8}$/.test(s)) {
        dateStr = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
      } else {
        dateStr = s.slice(0, 10);
      }
    }

    const month = dateStr.slice(0, 7);  // 'YYYY-MM'
    if (!month || month.length < 7) continue;

    const roundedAmt = Math.round(outAmt);
    const { category, subCategory, account } = classifyVendor(vendor, roundedAmt, historyIndex);

    result.push({
      date:        dateStr,
      month,
      category,
      subCategory,
      account,
      vendor,
      amount:      roundedAmt,
      source:      'bank',
    });
  }

  return result;
}

/**
 * 수시입출예금 입출금내역.xls "입금" 컬럼 파싱 (외상 대금 회수 매칭용)
 * parseBankExpenses와 같은 파일을 읽되 col6(입금) 기준. 카드사 입금은 제외
 * (bank_deposits.json에서 별도로 이미 추적하므로 중복/오매칭 방지).
 * @param {string} filePath
 * @returns {{ date:string, month:string, payer:string, amount:number, note:string }[]}
 */
// 통장 적요1의 흔한 은행 접미사("/타행이체" 등) 제거 — 업체명 매칭 정확도용
function stripBankSuffix(s) {
  return String(s || '').replace(/\/\s*(타행이체|대체|이체|입금)\s*$/, '').trim();
}

// "(주)"/"㈜"/"주식회사" 위치 차이로 매칭이 실패하는 것을 막기 위해 제거
// (예: "디비엘(주)음성지점" ↔ "디비엘음성지점" 을 같은 업체로 인식)
function stripCorpMarkers(s) {
  return String(s || '').replace(/\(주\)/g, '').replace(/㈜/g, '').replace(/주식회사/g, '').trim();
}

function parseBankIncoming(filePath) {
  const { normalizeCardName } = require('./bankParser');
  const wb = XLSX.readFile(filePath, { type: 'file', cellDates: true, codepage: 949 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let headerIdx = -1;
  let colDate = -1, colVendor = -1, colIn = -1, colNote = -1;

  for (let i = 0; i < Math.min(rows.length, 11); i++) {
    const row = rows[i].map(c => String(c).trim());
    const dIdx = row.findIndex(c => c === '거래일자');
    if (dIdx >= 0) {
      headerIdx = i;
      colDate   = dIdx;
      colVendor = row.findIndex(c => c === '적요1');
      colIn     = row.findIndex(c => c === '입금');
      colNote   = row.findIndex(c => c === '비고');
      if (colIn < 0) colIn = 6;
      break;
    }
  }
  if (headerIdx < 0) throw new Error('헤더 행(거래일자)을 찾을 수 없습니다.');

  const result = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawIn  = row[colIn];
    const inAmt  = typeof rawIn === 'number' ? rawIn : parseFloat(String(rawIn).replace(/,/g, '')) || 0;
    if (inAmt <= 0) continue;

    const payer = String(colVendor >= 0 ? (row[colVendor] || '') : '').trim();
    if (!payer) continue;
    if (normalizeCardName(payer)) continue;   // 카드사 입금은 별도 흐름(bank_deposits.json)에서 처리
    if (isInternalTransfer(payer)) continue;  // 대표자/내부 계좌간 이체는 외상 회수가 아님

    const rawDate = row[colDate];
    let dateStr = '';
    if (rawDate instanceof Date) {
      const y = rawDate.getFullYear();
      const m = String(rawDate.getMonth() + 1).padStart(2, '0');
      const d = String(rawDate.getDate()).padStart(2, '0');
      dateStr = `${y}-${m}-${d}`;
    } else {
      const s = String(rawDate).trim().replace(/[./]/g, '-');
      dateStr = /^\d{8}$/.test(s) ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : s.slice(0, 10);
    }
    const month = dateStr.slice(0, 7);
    if (!month || month.length < 7) continue;

    const note = String(colNote >= 0 ? (row[colNote] || '') : '').trim();
    result.push({ date: dateStr, month, payer, amount: Math.round(inAmt), note });
  }
  return result;
}

module.exports = {
  parseBankExpenses, buildHistoryIndex, classifyVendor,
  parseBankIncoming, normalize, vendorSimilarity,
  stripBankSuffix, stripCorpMarkers,
};
