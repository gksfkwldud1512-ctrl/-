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
  /^\(주\)미소주유소/,
  /^주식회사미소주유소/,
  /^하나\(주\)미소주유소/,
  /신정자/,   // 대표자 인출 전액 제외
  /이용주/,   // 대표자 관련 전액 제외
  /박미소/,   // 가족 관련 전액 제외
];

// ── 임대료 예외 패턴 (연료 제외에서 살려야 함) ──────────────────
const RENT_PATTERNS = [
  /충청동부지에이치디현/,
  /충북소매.*에이치디/,
];

// ── 자동 분류 맵 ─────────────────────────────────────────────────
const CATEGORY_MAP = [
  { re: /충청동부지에이치디현|충북소매.*에이치디/,        cat: '고정비', sub: '임대료' },
  { re: /KB카드출금|하나카드기업|하나카드|국민카드|롯데카드|신한카드|삼성카드|현대카드|비씨카드|우리카드|농협카드|카드출금|카드대금/, cat: '고정비', sub: '카드비' },
  { re: /이자[-_\s]\d+|대출이자|이자관련/,               cat: '고정비', sub: '이자' },
  { re: /한국전력|한전/,                                  cat: '고정비', sub: '전력비' },
  { re: /혁신세무|세무회계|세무사/,                       cat: '고정비', sub: '기장비' },
  { re: /신용보증기금/,                                   cat: '고정비', sub: '신용보증' },
  { re: /국세[-_]|국고[-_].*미소|공과금/,                cat: '고정비', sub: '세금' },
  { re: /바른유통|롯데칠성음료|우림상사/,                 cat: '고정비', sub: '유외상품' },
  { re: /에스케이쉴더스|웹케시|아이엠컴|케이티\/|KT\//,  cat: '고정비', sub: '운영비' },
  { re: /대소가스/,                                       cat: '고정비', sub: '수도비' },
  { re: /커피팜스/,                                       cat: '고정비', sub: '커피' },
  { re: /보험/,                                           cat: '고정비', sub: '보험비' },
  { re: /경찰청.*미소|자동차세/,                          cat: '고정비', sub: '자동차세' },
  { re: /퇴직금|퇴직적립/,                               cat: '변동비', sub: '퇴직금' },
  { re: /협회|조합비/,                                   cat: '변동비', sub: '협회비' },
];

function classifyVendor(vendor) {
  for (const { re, cat, sub } of CATEGORY_MAP) {
    if (re.test(vendor)) return { category: cat, subCategory: sub };
  }
  return { category: '변동비', subCategory: '기타' };
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
 * @returns {{ date:string, month:string, category:string, subCategory:string, vendor:string, amount:number, source:'bank' }[]}
 */
function parseBankExpenses(filePath) {
  const wb = XLSX.readFile(filePath, { type: 'file', cellDates: true });
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

    const { category, subCategory } = classifyVendor(vendor);

    result.push({
      date:        dateStr,
      month,
      category,
      subCategory,
      vendor,
      amount:      Math.round(outAmt),
      source:      'bank',
    });
  }

  return result;
}

module.exports = { parseBankExpenses };
