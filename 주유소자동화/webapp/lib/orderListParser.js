'use strict';
const XLSX = require('xlsx');

// 현대오일뱅크 주문목록 유종코드 → 내부 유종명
const FUEL_MAP = { 'ULSD': '경유', 'UG': '휘발유', 'K/O': '등유' };

function toNumber(v) {
  if (typeof v === 'number') return v;
  return parseFloat(String(v || '').replace(/,/g, '')) || 0;
}

function toDateStr(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim().replace(/[./]/g, '-');
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.slice(0, 10);
}

/**
 * 현대오일뱅크 주문목록.xlsx 파싱
 * 배차 완료(출하상태==='출고완료')된 유류(제품군==='경질유') 항목만 추출한다.
 * 출하일자(실제 배차 완료일) 기준으로 입고 처리 — 출하요청일과 다를 수 있음.
 * @param {string} filePath
 * @returns {{date:string, fuel:string, qty:number, price:number}[]}
 */
function parseOrderLots(filePath) {
  const wb = XLSX.readFile(filePath, { type: 'file', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) return [];

  const header = rows[0].map(c => String(c).trim());
  const col = name => header.indexOf(name);
  const cGroup    = col('제품군');
  const cFuel     = col('유종');
  const cQty      = col('배차수량');
  const cPrice    = col('주문가격(원)');
  const cStatus   = col('출하상태');
  const cShipDate = col('출하일자');
  const cReqDate  = col('출하요청일');

  if (cFuel < 0 || cQty < 0 || (cShipDate < 0 && cReqDate < 0)) {
    throw new Error('주문목록 형식을 인식할 수 없습니다 (유종/배차수량/출하일자 컬럼을 찾을 수 없음)');
  }

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;

    if (cGroup >= 0 && String(r[cGroup]).trim() !== '경질유') continue;   // 윤활유 등 유류 외 품목 제외
    if (cStatus >= 0 && String(r[cStatus]).trim() !== '출고완료') continue; // 배차 완료분만 (적재중/취소 등 제외)

    const fuel = FUEL_MAP[String(r[cFuel]).trim()];
    if (!fuel) continue;

    const qty = toNumber(r[cQty]);
    if (qty <= 0) continue;

    const price = toNumber(cPrice >= 0 ? r[cPrice] : 0);
    const dateStr = toDateStr(cShipDate >= 0 ? r[cShipDate] : '') || toDateStr(cReqDate >= 0 ? r[cReqDate] : '');
    if (!dateStr || dateStr.length < 10) continue;

    result.push({ date: dateStr, fuel, qty: Math.round(qty), price: Math.round(price) });
  }

  return result;
}

module.exports = { parseOrderLots };
