'use strict';
const XLSX = require('xlsx');
const { readWorkbookAuto } = require('./xlsxReader');

// BOS "유류대 입금현황" (입금일자·고객코드·입금고객명·입금전표번호·입금유형·입금액·입금카드사명·참고사항)
// 사장님이 외상 업체에서 돈을 받으면(통장·카드·상품권·조정) BOS에 입금 등록한 기록.
// 등록일은 그 돈이 갚은 거래월의 말일(25일 마감 업체는 25일) — 예: 9월 거래분은 9/30로 등록.
const norm = v => String(v ?? '').replace(/\s/g, '');

function findHeader(raw) {
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const cells = (raw[i] || []).map(norm);
    if (cells.includes('입금일자') && cells.includes('입금고객명') && cells.includes('입금유형')) return i;
  }
  return -1;
}

function toDate(v) {
  if (typeof v === 'number' && v > 40000 && v < 60000) {
    const d = XLSX.SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const m = String(v ?? '').trim().replace(/[./]/g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}

// → { rows: [{ slip, date, code, vendor, kind, amount, cardCompany, note }], range }
//   kind: 현금 | 카드 | 상품권 | 조정
async function parseBosReceipts(filePath) {
  const wb  = await readWorkbookAuto(filePath);
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const hi  = findHeader(raw);
  if (hi < 0) throw new Error('유류대 입금현황 헤더(입금일자·입금고객명·입금유형)를 찾지 못했습니다.');
  const cells = raw[hi].map(norm);
  const col = n => cells.indexOf(n);
  const c = { date: col('입금일자'), code: col('고객코드'), vendor: col('입금고객명'), slip: col('입금전표번호'),
              type: col('입금유형'), amount: col('입금액'), card: col('입금카드사명'), note: col('참고사항') };
  const rows = [];
  for (const r of raw.slice(hi + 1)) {
    const date = toDate(r[c.date]);
    const vendor = String(r[c.vendor] ?? '').trim();
    if (!date || !vendor) continue;
    const amount = Number(String(r[c.amount] ?? '').replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount === 0) continue;
    const type = String(r[c.type] ?? '');
    const kind = type.includes('조정') ? '조정' : type.includes('카드') ? '카드' : type.includes('상품권') ? '상품권' : '현금';
    rows.push({ slip: String(r[c.slip] ?? '').trim(), date, code: String(r[c.code] ?? '').trim(), vendor, kind, amount,
                cardCompany: String(r[c.card] ?? '').trim(), note: String(r[c.note] ?? '').trim() });
  }
  const dates = rows.map(r => r.date).sort();
  return { rows, range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null };
}

module.exports = { parseBosReceipts, findHeader };
