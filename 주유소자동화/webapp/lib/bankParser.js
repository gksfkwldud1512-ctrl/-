'use strict';
const XLSX = require('xlsx');

// 카드사 이름 정규화 (은행 적요1 → 공통명)
// 실제 카드 입금 적요는 "브랜드명+가맹점정산번호(숫자)" 형태(예: "삼성13929395")라
// 브랜드명 뒤에 숫자가 바로 붙는 경우만 카드로 인정한다. 느슨하게 "현대"/"삼성"/"우리"
// 등 단어 포함 여부만 보면 "현대스크랩", "(주)우리들푸드", "삼성냉난방기" 같은
// 실제 거래처명까지 카드로 오판해 외상 입금 매칭에서 통째로 사라지는 문제가 있었음.
function normalizeCardName(raw) {
  const s = String(raw || '').trim();
  if (/^KB\d|국민카드/i.test(s))   return 'KB국민카드';
  if (/^삼성\d/i.test(s))           return '삼성카드';
  if (/^NH\d|^농협\d/i.test(s))     return '농협카드';
  if (/^롯데\d|롯데카드/i.test(s))  return '롯데카드';
  if (/BC\/매출대금|비씨카드/i.test(s)) return '비씨카드';
  if (/^신한\d/i.test(s))           return '신한카드';
  if (/^현대\d/i.test(s))           return '현대카드';
  if (/하나카드|하나체크|하나구외환|^하나\d{6,}/i.test(s)) return '하나카드';
  if (/^우리\d/i.test(s))           return '우리카드';
  return null; // 카드사 아님
}

function parseBankDeposits(filePath) {
  const wb  = XLSX.readFile(filePath);
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 헤더 행 찾기 ("거래일자" 포함)
  const headerIdx = raw.findIndex(r => r[0] === '거래일자');
  if (headerIdx < 0) throw new Error('거래일자 헤더를 찾을 수 없습니다. 파일을 확인하세요.');

  const dataRows = raw.slice(headerIdx + 1).filter(r => r[0]);

  // { "2026-05-08": { "신한카드": 9637628, "비씨카드": 4427843 ... } }
  const deposits = {};

  dataRows.forEach(r => {
    const date   = String(r[0] || '').trim();   // "2026-05-29"
    const 적요   = String(r[5] || '').trim();   // 적요1
    const amount = Number(r[6]) || 0;           // 입금

    if (!date || !amount) return;

    const cardName = normalizeCardName(적요);
    if (!cardName) return; // 카드사 입금이 아님

    if (!deposits[date]) deposits[date] = {};
    deposits[date][cardName] = (deposits[date][cardName] || 0) + amount;
  });

  return deposits;
}

module.exports = { parseBankDeposits, normalizeCardName };
