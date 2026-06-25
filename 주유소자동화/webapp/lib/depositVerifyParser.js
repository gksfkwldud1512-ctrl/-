'use strict';
const XLSX = require('xlsx');

const CARD_NORM = {
  '하나카드(외환)': '하나카드', '하나구외환': '하나카드', '하나카드': '하나카드', '하나체크카드': '하나카드',
  '국민카드': '국민카드', 'KB국민카드': '국민카드',
  'BC카드': 'BC카드', '비씨카드': 'BC카드',
  '신한카드': '신한카드',
  '삼성카드': '삼성카드',
  '현대카드': '현대카드',
  '롯데카드': '롯데카드', '롯데(구동양)': '롯데카드',
  'NH카드': 'NH카드', '농협카드': 'NH카드',
  '우리카드': '우리카드',
  'JCB카드': 'JCB카드',
};
function normCard(name) {
  const s = String(name || '').trim();
  return CARD_NORM[s] || s;
}

function toDateStr(v) {
  if (!v) return '';
  if (typeof v === 'number' && v > 40000) {
    const d = new Date((v - 25569) * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  const s = String(v).trim().replace(/\./g, '-').replace(/(\d{8})/, m => `${m.slice(0,4)}-${m.slice(4,6)}-${m.slice(6,8)}`);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0,10) : '';
}

// BOS 시재현황 파싱
function parseBosDeposit(filePath) {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let hdrIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].includes('카드사명') && rows[i].includes('당기발생')) { hdrIdx = i; break; }
  }
  if (hdrIdx < 0) return [];

  const hdr    = rows[hdrIdx];
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

// 이지샵 입금내역 파싱
// 롯데(구동양)는 '합계금액' = 실제 입금 기준금액, '접수금액' = 누적금액
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
  const colCard   = hdr.indexOf('카드사');
  const colDate   = hdr.findIndex(h => String(h).includes('입금예정일자') || String(h).includes('입금일자'));
  const col건수   = hdr.indexOf('접수건수');
  const col접수   = hdr.indexOf('접수금액');
  const col합계   = hdr.indexOf('합계금액');   // 롯데카드: 실제 이번 입금 기준금액
  const col수수료 = hdr.indexOf('수수료');
  const col입금   = hdr.indexOf('입금예정액');

  const result = [];
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const card = normCard(r[colCard]);
    const date = toDateStr(r[colDate]);
    if (!card || !date) continue;
    const 접수건수  = Number(r[col건수])  || 0;
    const 접수금액  = Number(r[col접수])  || 0;
    const 합계금액  = col합계 >= 0 ? (Number(r[col합계]) || 0) : 0;
    const 수수료    = Number(r[col수수료]) || 0;
    const 입금예정액 = Number(r[col입금])  || 0;
    if (!접수금액) continue;
    // 매칭기준금액: 롯데카드는 합계금액(실입금기준), 나머지는 접수금액
    const 매칭기준금액 = 합계금액 > 0 ? 합계금액 : 접수금액;
    result.push({ date, card, 접수건수, 접수금액, 합계금액, 매칭기준금액, 수수료, 입금예정액 });
  }
  return result;
}

// BOS 발생(매출)을 이지샵 매칭기준금액과 연결
// - 완전 일치(차이=0)만 match, 나머지는 mismatch
// - 롯데카드: 합계금액=0이면 이번 입금 없음(pending)
function matchDeposits(bosList, easyList) {
  bosList  = bosList.map(r  => ({ ...r, card: normCard(r.card) }));
  easyList = easyList.map(r => ({ ...r, card: normCard(r.card) }));

  const bosMap = {};
  for (const b of bosList) {
    if (b.발생 <= 0) continue;
    if (!bosMap[b.card]) bosMap[b.card] = [];
    bosMap[b.card].push(b);
  }
  for (const c of Object.keys(bosMap)) {
    bosMap[c].sort((a, b) => a.date.localeCompare(b.date));
  }

  const usedDates = {};
  const results = [];

  for (const ez of easyList) {
    const 기준금액 = ez.매칭기준금액 ?? ez.접수금액;

    // 합계금액=0 → 이번에 입금 없음(pending)
    if (ez.합계금액 === 0 && ez.입금예정액 === 0) {
      results.push({
        입금일: ez.date, card: ez.card,
        발생일: null, bosFrom: null, bosTo: null, 발생금액: null,
        접수금액: ez.접수금액, 합계금액: ez.합계금액, 매칭기준금액: 기준금액,
        접수건수: ez.접수건수, 수수료: ez.수수료, 입금예정액: ez.입금예정액,
        금액차이: null, status: 'pending',
      });
      continue;
    }

    const bosRows = bosMap[ez.card] || [];
    if (!usedDates[ez.card]) usedDates[ez.card] = new Set();

    const candidates = bosRows.filter(b =>
      b.date < ez.date && dateDiff(b.date, ez.date) <= 14
    );

    if (!candidates.length) {
      results.push({
        입금일: ez.date, card: ez.card,
        발생일: null, bosFrom: null, bosTo: null, 발생금액: null,
        접수금액: ez.접수금액, 합계금액: ez.합계금액, 매칭기준금액: 기준금액,
        접수건수: ez.접수건수, 수수료: ez.수수료, 입금예정액: ez.입금예정액,
        금액차이: null, status: 'ez_only',
      });
      continue;
    }

    // 완전 일치 우선 탐색 (차이=0)
    let bestMatch = null;
    let bestDiff  = Infinity;

    for (let winSize = 1; winSize <= 5; winSize++) {
      for (let end = candidates.length - 1; end >= winSize - 1; end--) {
        const win = candidates.slice(end - winSize + 1, end + 1);
        let consecutive = true;
        for (let k = 1; k < win.length; k++) {
          if (dateDiff(win[k-1].date, win[k].date) > 3) { consecutive = false; break; }
        }
        if (!consecutive) continue;
        if (win.some(b => usedDates[ez.card].has(b.date))) continue;

        const sum  = win.reduce((s, b) => s + b.발생, 0);
        const diff = Math.abs(sum - 기준금액);
        if (diff < bestDiff) {
          bestDiff  = diff;
          bestMatch = { win, sum };
        }
        if (diff === 0) break;  // 완전 일치 발견 시 즉시 선택
      }
      if (bestDiff === 0) break;
    }

    if (!bestMatch) {
      results.push({
        입금일: ez.date, card: ez.card,
        발생일: null, bosFrom: null, bosTo: null, 발생금액: null,
        접수금액: ez.접수금액, 합계금액: ez.합계금액, 매칭기준금액: 기준금액,
        접수건수: ez.접수건수, 수수료: ez.수수료, 입금예정액: ez.입금예정액,
        금액차이: null, status: 'ez_only',
      });
      continue;
    }

    const { win, sum } = bestMatch;
    const 금액차이 = 기준금액 - sum;
    // 완전 일치(0원 차이)만 match, 나머지는 mismatch
    const status = 금액차이 === 0 ? 'match' : 'mismatch';

    for (const b of win) usedDates[ez.card].add(b.date);

    const bosFrom = win[0].date;
    const bosTo   = win[win.length - 1].date;
    const 발생일  = win.length > 1 ? `${bosFrom}~${bosTo}` : bosFrom;

    results.push({
      입금일: ez.date, card: ez.card,
      발생일, bosFrom, bosTo, 발생금액: sum,
      접수금액: ez.접수금액, 합계금액: ez.합계금액, 매칭기준금액: 기준금액,
      접수건수: ez.접수건수, 수수료: ez.수수료, 입금예정액: ez.입금예정액,
      금액차이, status,
    });
  }

  // BOS에만 있는 발생
  for (const card of Object.keys(bosMap)) {
    for (const b of bosMap[card]) {
      if (!(usedDates[card] && usedDates[card].has(b.date))) {
        results.push({
          입금일: null, card: b.card,
          발생일: b.date, bosFrom: b.date, bosTo: b.date, 발생금액: b.발생,
          접수금액: null, 합계금액: null, 매칭기준금액: null,
          접수건수: null, 수수료: null, 입금예정액: null,
          금액차이: null, status: 'bos_only',
        });
      }
    }
  }

  results.sort((a, b) =>
    (a.입금일 || a.bosFrom || '').localeCompare(b.입금일 || b.bosFrom || '') ||
    (a.card || '').localeCompare(b.card || '')
  );
  return results;
}

function dateDiff(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / 86400000);
}

module.exports = { parseBosDeposit, parseEasyshopDeposit, matchDeposits };
