'use strict';
const XLSX = require('xlsx');

// 카드사 이름 정규화 (은행 적요1 → 공통명)
function normalizeCardName(raw) {
  const s = String(raw || '').trim();
  if (/KB|국민카드/i.test(s))   return 'KB국민카드';
  if (/삼성/i.test(s))           return '삼성카드';
  if (/NH|농협/i.test(s))        return '농협카드';
  if (/롯데/i.test(s))           return '롯데카드';
  if (/BC|비씨/i.test(s))        return '비씨카드';
  if (/신한/i.test(s))           return '신한카드';
  if (/현대/i.test(s))           return '현대카드';
  if (/하나카드|하나체크|하나구외환|하나\d{6,}/i.test(s)) return '하나카드';
  if (/우리/i.test(s))           return '우리카드';
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
