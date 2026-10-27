'use strict';
const XLSX = require('xlsx');
const { readWorkbookAuto } = require('./xlsxReader');

// 통합 업로드("자료 올리기")용 파일 종류 자동 판별.
// 각 파서가 이미 쓰는 헤더 기준을 그대로 따른다 — 판별만 하고 파싱은 기존 파서가 함.
//
// 카드 매출자료(27컬럼)는 이지샵·나이스 양식이 똑같아서 단말기번호로 구분한다.
// 기본 단말기 외에 처음 보는 단말기는 화면에서 고르게 하고 data/card_terminals.json에 기억.
const DEFAULT_CARD_TERMINALS = { '2781381': 'easyshop', '8405124': 'nice' };

const norm = v => String(v ?? '').replace(/[▼▲↓↑\s]/g, '');

function rowHas(row, names) {
  const cells = (row || []).map(norm);
  return names.every(n => cells.includes(n));
}

// 데이터 행의 날짜 범위 (YYYY-MM-DD 문자열 또는 엑셀 시리얼)
function dateRange(rows, col) {
  const dates = [];
  for (const r of rows) {
    let v = r[col];
    if (typeof v === 'number' && v > 40000 && v < 60000) {
      const d = XLSX.SSF.parse_date_code(v);
      v = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
    const m = String(v ?? '').trim().replace(/[./]/g, '-').match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) dates.push(m[1]);
  }
  dates.sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}

// 단말기번호 목록 (숫자만 — 통합거래조회는 표가 두 개라 중간에 헤더 글자가 섞임)
function terminalList(rows, col) {
  if (col < 0) return [];
  return [...new Set(rows.map(r => String(r[col] ?? '').trim()).filter(t => /^\d+$/.test(t)))];
}

// → { type, label, range?, terminals?, sheetNames }
//   type: bos-sales | bos-integrated | card-sales | card-integrated | bank | tank | orders |
//         deposit-bos | deposit-easy | ar-bos-receipts | management | customers | unknown
async function detectUploadType(filePath) {
  const wb   = await readWorkbookAuto(filePath);
  const sheetNames = wb.SheetNames;
  const ws   = wb.Sheets[sheetNames[0]];
  const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const head = raw.slice(0, 30);
  const base = { sheetNames };

  // 마감자료(판매관리·지출관리 시트) — 입고이력·지출 전체를 교체하므로 자동 반영하지 않음
  if (sheetNames.includes('판매관리') || sheetNames.includes('지출관리')) {
    return { ...base, type: 'management', label: '주유소 마감자료' };
  }

  // 고객등록 양식 — 고객 관리 탭에서 따로 올림
  if (sheetNames.includes('고객등록')) {
    return { ...base, type: 'customers', label: '고객등록 양식' };
  }

  // BOS 판매전표 — 3행 헤더 위치로 형식 구분 (dailyBosParser.detectFormat과 같은 기준)
  const h2 = raw[2] || [];
  if (norm(h2[1]) === '판매일자') {
    const range = dateRange(raw.slice(3), 1);
    if (norm(h2[8]) === '결제구분' && norm(h2[4]) === '고객명') {
      return { ...base, type: 'bos-sales', label: 'BOS 판매전표 상세조회', range };
    }
    if (norm(h2[6]) === '결제구분') {
      return { ...base, type: 'bos-integrated', label: 'BOS 거래내역', range };
    }
  }

  // 카드 매출자료 (이지샵/나이스 공통 27컬럼)
  for (let i = 0; i < Math.min(head.length, 10); i++) {
    if (rowHas(head[i], ['거래고유번호', '승인번호'])) {
      const cells = head[i].map(norm);
      const tCol  = cells.indexOf('단말기번호');
      const dCol  = cells.findIndex(c => c === '거래일시' || c === '거래일자');
      const body  = raw.slice(i + 1);
      const terminals = terminalList(body, tCol);
      return { ...base, type: 'card-sales', label: '카드 매출자료', terminals,
               range: dCol >= 0 ? dateRange(body, dCol) : null };
    }
  }

  // 나이스 통합거래조회 (easyshopParser.findIntegratedHeaderIndex와 같은 기준)
  for (let i = 0; i < head.length; i++) {
    if (rowHas(head[i], ['구분', '승인번호', '카드번호', '매입사'])) {
      const cells = head[i].map(norm);
      const tCol  = cells.indexOf('CAT_ID');
      const body  = raw.slice(i + 1);
      const terminals = terminalList(body, tCol);
      return { ...base, type: 'card-integrated', label: '나이스 통합거래조회', terminals,
               range: dateRange(body, cells.indexOf('거래일자')) };
    }
  }

  for (let i = 0; i < Math.min(head.length, 11); i++) {
    const cells = (head[i] || []).map(norm);
    // 통장 수시입출 (bankExpenseParser·bankParser 공통 헤더)
    if (cells.includes('거래일자') && cells.includes('적요1')) {
      return { ...base, type: 'bank', label: '통장 입출금내역',
               range: dateRange(raw.slice(i + 1), cells.indexOf('거래일자')) };
    }
  }

  // BOS 유류대 입금현황 (외상 업체 입금 등록 기록)
  for (let i = 0; i < Math.min(head.length, 10); i++) {
    if (rowHas(head[i], ['입금일자', '입금고객명', '입금유형'])) {
      return { ...base, type: 'ar-bos-receipts', label: 'BOS 유류대 입금현황',
               range: dateRange(raw.slice(i + 1), head[i].map(norm).indexOf('입금일자')) };
    }
  }

  // 탱크 실재고량.xlsx
  if (norm(raw[0]?.[0]) === '날짜' && norm(raw[0]?.[1]) === '작성시간') {
    return { ...base, type: 'tank', label: '탱크 실재고량', range: dateRange(raw.slice(1), 0) };
  }

  // 현대오일뱅크 주문목록
  if (rowHas(raw[0], ['제품군', '유종', '배차수량'])) {
    return { ...base, type: 'orders', label: '정유사 주문목록' };
  }

  for (const r of raw) {
    if (rowHas(r, ['카드사명', '당기발생'])) return { ...base, type: 'deposit-bos', label: 'BOS 시재현황' };
  }
  for (const r of head) {
    const cells = (r || []).map(norm);
    if (cells.some(c => c.includes('입금예정일자')) && cells.includes('카드사')) {
      return { ...base, type: 'deposit-easy', label: '이지샵 입금내역' };
    }
  }

  return { ...base, type: 'unknown', label: '알 수 없는 파일' };
}

module.exports = { detectUploadType, DEFAULT_CARD_TERMINALS };
