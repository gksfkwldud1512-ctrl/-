'use strict';
const XLSX = require('xlsx');

// 카드사명 정규화
const CARD_NORM = {
  // BOS → 표준
  '하나카드(외환)': '하나카드', '하나구외환': '하나카드', '하나카드': '하나카드',
  '국민카드': '국민카드', 'KB국민카드': '국민카드',
  'BC카드': 'BC카드', '비씨카드': 'BC카드',
  '신한카드': '신한카드',
  '삼성카드': '삼성카드',
  '현대카드': '현대카드',
  '롯데카드': '롯데카드',
  'NH카드': 'NH카드', '농협카드': 'NH카드',
  '우리카드': '우리카드',
  'JCB카드': 'JCB카드',
};
function normCard(name) {
  const s = String(name || '').trim();
  return CARD_NORM[s] || s;
}

// Excel 날짜 시리얼 → YYYY-MM-DD
function toDateStr(v) {
  if (!v) return '';
  if (typeof v === 'number' && v > 40000) {
    const d = new Date((v - 25569) * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  const s = String(v).trim().replace(/\./g, '-').replace(/(\d{8})/, m => `${m.slice(0,4)}-${m.slice(4,6)}-${m.slice(6,8)}`);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0,10) : '';
}

// BOS 시재현황 파싱 → [{date, card, 발생, 입금, 잔액}]
function parseBosDeposit(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 헤더 행 찾기 (카드사명/일자 등이 있는 행)
  let hdrIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].includes('카드사명') && rows[i].includes('당기발생')) { hdrIdx = i; break; }
  }
  if (hdrIdx < 0) return [];

  const hdr = rows[hdrIdx];
  const colCard = hdr.indexOf('카드사명');
  const colDate = hdr.indexOf('일자');
  const col발생 = hdr.indexOf('당기발생');
  const col입금 = hdr.indexOf('당기입금');
  const col잔액 = hdr.indexOf('당기잔액');
  const col구분 = hdr.indexOf('시재구분');

  const result = [];
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const card = normCard(r[colCard]);
    const date = toDateStr(r[colDate]);
    const 구분 = String(r[col구분] || '').trim();
    if (!card || !date || 구분 === '현금') continue;
    const 발생 = Number(r[col발생]) || 0;
    const 입금 = Number(r[col입금]) || 0;
    const 잔액 = Number(r[col잔액]) || 0;
    if (!발생 && !입금) continue;
    result.push({ date, card, 발생, 입금, 잔액 });
  }
  return result;
}

// 이지샵 입금내역 파싱 → [{date, card, 접수건수, 접수금액, 수수료, 입금예정액}]
function parseEasyshopDeposit(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let hdrIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].includes('입금예정일자') || rows[i].includes('카드사')) { hdrIdx = i; break; }
  }
  if (hdrIdx < 0) return [];

  const hdr = rows[hdrIdx];
  const colCard = hdr.indexOf('카드사');
  const colDate = hdr.findIndex(h => String(h).includes('입금예정일자') || String(h).includes('입금일자'));
  const col건수  = hdr.indexOf('접수건수');
  const col금액  = hdr.indexOf('접수금액');
  const col수수료 = hdr.indexOf('수수료');
  const col입금  = hdr.indexOf('입금예정액');

  const result = [];
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const card = normCard(r[colCard]);
    const date = toDateStr(r[colDate]);
    if (!card || !date) continue;
    const 접수건수  = Number(r[col건수])  || 0;
    const 접수금액  = Number(r[col금액])  || 0;
    const 수수료    = Number(r[col수수료]) || 0;
    const 입금예정액 = Number(r[col입금])  || (접수금액 - 수수료);
    if (!접수금액) continue;
    result.push({ date, card, 접수건수, 접수금액, 수수료, 입금예정액 });
  }
  return result;
}

// 연속 날짜 합산으로 이지샵 금액 매칭
// BOS 발생을 1~5일 연속 합산해서 이지샵 접수금액과 비교
function matchDeposits(bosList, easyList) {
  // 카드사별 날짜 정렬 BOS 맵
  const bosMap = {};  // card → [{date, 발생}] sorted
  for (const b of bosList) {
    if (b.발생 <= 0) continue;
    if (!bosMap[b.card]) bosMap[b.card] = [];
    bosMap[b.card].push(b);
  }
  for (const c of Object.keys(bosMap)) {
    bosMap[c].sort((a, b) => a.date.localeCompare(b.date));
  }

  const usedDates = {};  // card → Set of used BOS dates
  const results = [];

  // 이지샵 기준 매칭
  for (const ez of easyList) {
    const bosRows = bosMap[ez.card] || [];
    if (!usedDates[ez.card]) usedDates[ez.card] = new Set();

    // 입금예정일 이전 1~12일 범위의 BOS 행들
    const candidates = bosRows.filter(b =>
      b.date < ez.date && dateDiff(b.date, ez.date) <= 12
    );

    if (!candidates.length) {
      results.push({ ...ez, bosFrom: null, bosTo: null, bos발생합계: null, bos발생Days: null, 지연일수: null, 금액차이: null, status: 'ez_only' });
      continue;
    }

    // 연속 날짜 윈도우 합산 탐색 (1~5일 윈도우)
    let bestMatch = null;
    let bestDiff  = Infinity;

    for (let winSize = 1; winSize <= 5; winSize++) {
      for (let end = candidates.length - 1; end >= winSize - 1; end--) {
        const window = candidates.slice(end - winSize + 1, end + 1);
        // 날짜가 연속인지 확인 (최대 1일 공백 허용 - 주말)
        let consecutive = true;
        for (let k = 1; k < window.length; k++) {
          if (dateDiff(window[k-1].date, window[k].date) > 3) { consecutive = false; break; }
        }
        if (!consecutive) continue;
        // 이미 사용된 날짜 포함 여부 확인
        if (window.some(b => usedDates[ez.card].has(b.date))) continue;

        const sum = window.reduce((s, b) => s + b.발생, 0);
        const diff = Math.abs(sum - ez.접수금액);
        if (diff < bestDiff) {
          bestDiff  = diff;
          bestMatch = { window, sum };
        }
      }
    }

    if (!bestMatch) {
      results.push({ ...ez, bosFrom: null, bosTo: null, bos발생합계: null, bos발생Days: null, 지연일수: null, 금액차이: null, status: 'ez_only' });
      continue;
    }

    const { window, sum } = bestMatch;
    const pct = bestDiff / ez.접수금액;
    const status = pct <= 0.02 ? 'match'    // 2% 이내 = 정상 (수수료·단수 차이)
                 : pct <= 0.10 ? 'warn'     // 10% 이내 = 주의
                 : 'mismatch';

    // 사용 처리
    for (const b of window) usedDates[ez.card].add(b.date);

    const bosFrom = window[0].date;
    const bosTo   = window[window.length - 1].date;
    const 지연일수 = dateDiff(bosTo, ez.date);  // 마지막 발생일 기준 지연
    const 금액차이 = ez.접수금액 - sum;
    const bos발생Days = window.length > 1 ? `${bosFrom}~${bosTo}` : bosFrom;

    results.push({ ...ez, bosFrom, bosTo, bos발생합계: sum, bos발생Days, 지연일수, 금액차이, status });
  }

  // BOS에만 있는 것
  for (const card of Object.keys(bosMap)) {
    for (const b of bosMap[card]) {
      if (!(usedDates[card] && usedDates[card].has(b.date))) {
        results.push({
          date: null, card: b.card, 접수건수: null, 접수금액: null, 수수료: null, 입금예정액: null,
          bosFrom: b.date, bosTo: b.date, bos발생합계: b.발생, bos발생Days: b.date,
          지연일수: null, 금액차이: null, status: 'bos_only',
        });
      }
    }
  }

  results.sort((a, b) => (a.date || a.bosFrom || '').localeCompare(b.date || b.bosFrom || '') || (a.card || '').localeCompare(b.card || ''));
  return results;
}

function dateDiff(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / 86400000);
}

module.exports = { parseBosDeposit, parseEasyshopDeposit, matchDeposits };
