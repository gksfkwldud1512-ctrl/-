'use strict';
// 버스 유가보조금 정산 내역(transcompSetlExcel_*.xls) 파싱 + BOS 거래와 매칭
//
// 정산 파일: 업체(사업자번호)마다 한 달 이용분을 다음 달에 한 번에 정산한 합계 1행
//   (예: 하나관광 10/12 4,281,723원 12건 2,282L = 9월 이용분, 한누리투어 10/23 = 9월 이용분)
//   건수 0·1이고 주유 당일 결제된 행은 건별 정산(예: 문수관광) → 날짜·금액으로 건별 매칭
//
// 매칭 (업체 × 이용월):
//   후보 = 그 달 BOS 유류 거래 중 카드 승인번호가 있는 것 (외상 + 신용카드 입력분)
//   ① 건별: 승인번호로 카드(VAN) 자료에서 찾아 금액 비교 (BOS 금액 오류 표시)
//   ② 합계: 정산 건수·주유량(±1L)이 후보 전체와 같으면 "정산 확인" — 후보 전부 유가보조
//      안 맞으면 후보 중 1~3건을 빼서 건수·주유량이 맞는 조합이 하나뿐일 때만 확인 (뺀 건 = 유가보조 아님)
//   ③ 정산 행이 없으면 "정산 전" (정산은 다음 달 중순쯤 들어옴)
const XLSX = require('xlsx');
const { readWorkbookAuto } = require('./xlsxReader');

const FUELS = new Set(['휘발유', '경유', '등유']);
const LITER_TOL = 1;
const digits = s => String(s ?? '').replace(/\D/g, '');

function normDate(v) {
  if (typeof v === 'number' && v > 40000 && v < 60000) {
    const d = XLSX.SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const m = String(v ?? '').trim().replace(/[./]/g, '-').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function findHeader(raw) {
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const cells = (raw[i] || []).map(c => String(c ?? '').replace(/\s/g, ''));
    if (cells.includes('업체명') && cells.includes('사업자번호') && cells.includes('결제금액')) return { i, cells };
  }
  return null;
}

// 판별용 (uploadDetector)
function isSubsidySettlementSheet(raw) { return !!findHeader(raw); }

async function parseSubsidySettlement(filePath) {
  const wb  = await readWorkbookAuto(filePath);
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const h = findHeader(raw);
  if (!h) throw new Error('유가보조 정산 내역 헤더(업체명·사업자번호·결제금액)를 찾지 못했습니다.');
  const col = name => h.cells.indexOf(name);
  const c = {
    station: col('주유/충전소명'), company: col('업체명'), bizNo: col('사업자번호'), fuel: col('유종'),
    liters: col('주유/충전량'), count: col('건수'), cardCo: col('카드사'),
    date: col('결제일자'), time: col('결제시간'), amount: col('결제금액'),
  };
  const rows = [];
  for (const r of raw.slice(h.i + 1)) {
    const payDate = normDate(r[c.date]);
    const amount  = Number(r[c.amount]) || 0;
    if (!payDate || !amount) continue;
    rows.push({
      company: String(r[c.company] ?? '').trim(),
      bizNo:   digits(r[c.bizNo]),
      fuel:    String(r[c.fuel] ?? '').trim(),
      liters:  Number(r[c.liters]) || 0,
      count:   Number(r[c.count]) || 0,
      cardCo:  String(r[c.cardCo] ?? '').trim(),
      payDate,
      payTime: String(r[c.time] ?? '').trim(),
      amount,
    });
  }
  const dates = rows.map(r => r.payDate).sort();
  return { rows, range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null };
}

const rowKey = r => `${r.bizNo}|${r.payDate}|${r.payTime}|${r.amount}`;

// 기존 저장분에 합치기 (같은 행은 한 번만)
function mergeSettlements(existing, rows) {
  const map = new Map((existing || []).map(r => [rowKey(r), r]));
  let added = 0;
  for (const r of rows) { if (!map.has(rowKey(r))) added++; map.set(rowKey(r), r); }
  return { list: [...map.values()].sort((a, b) => a.payDate.localeCompare(b.payDate) || a.company.localeCompare(b.company)), added };
}

const ymOf = d => String(d || '').replace(/\//g, '-').slice(0, 7);
function prevYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const txKey = t => `${String(t.date).replace(/-/g, '/')}|${t.approvalNo || ''}|${t.amount}`;

// 정산 행 → 이용월: 건별 행(건수 ≤1, 결제일 = 주유일)은 결제월, 합계 행은 결제월의 전달
function usageMonthOf(row) { return row.count <= 1 ? ymOf(row.payDate) : prevYm(ymOf(row.payDate)); }

// 후보 중 k건을 빼서 건수·주유량이 맞는 조합 찾기
//   주유량이 맞는 조합 중 정산 금액과 차이가 가장 작은 것이 하나뿐일 때만 (같은 리터 거래가 여럿이면 금액으로 가림)
function findExclusion(cands, wantCount, wantLiters, wantAmount) {
  const k = cands.length - wantCount;
  if (k < 1 || k > 3) return null;
  const totalQ = cands.reduce((s, t) => s + (Number(t.qty) || 0), 0);
  const totalA = cands.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const found = [];
  const n = cands.length;
  const pick = (start, chosen, sumQ, sumA) => {
    if (found.length > 200) return;
    if (chosen.length === k) {
      if (Math.abs(totalQ - sumQ - wantLiters) <= LITER_TOL) found.push({ idx: chosen.slice(), diff: Math.abs(totalA - sumA - wantAmount) });
      return;
    }
    for (let i = start; i < n; i++) {
      chosen.push(i);
      pick(i + 1, chosen, sumQ + (Number(cands[i].qty) || 0), sumA + (Number(cands[i].amount) || 0));
      chosen.pop();
    }
  };
  pick(0, [], 0, 0);
  if (!found.length || found.length > 200) return null;
  const best = Math.min(...found.map(f => f.diff));
  const top = found.filter(f => f.diff === best);
  return top.length === 1 ? top[0].idx : null;
}

// 업체 × 이용월 매칭
//   txs: 그 업체 그 달 BOS 거래(외상 + 신용카드 입력분), settleRows: 그 업체 정산 행 전체,
//   cardByApproval: Map(승인번호 → 카드 거래)
function matchVendorMonth({ ym, txs, settleRows, cardByApproval }) {
  const cands = (txs || []).filter(t => FUELS.has(t.product) && t.approvalNo && ymOf(t.date) === ym);
  // ① 건별 카드 대조
  const cardDiffs = [], cardMissing = [];
  for (const t of cands) {
    const c = cardByApproval?.get(String(t.approvalNo));
    if (!c) cardMissing.push(t);
    else if (Number(c.amount) !== Number(t.amount)) cardDiffs.push({ tx: t, cardAmount: Number(c.amount), diff: Number(c.amount) - Number(t.amount) });
  }
  const rows = (settleRows || []).filter(r => usageMonthOf(r) === ym);
  const base = {
    ym, candidates: cands.length,
    candLiters: Math.round(cands.reduce((s, t) => s + (Number(t.qty) || 0), 0) * 100) / 100,
    candAmount: cands.reduce((s, t) => s + (Number(t.amount) || 0), 0),
    cardDiffs, cardMissing: cardMissing.length,
    settlements: rows,
  };
  if (!rows.length) return { ...base, status: 'pending', keys: [], excluded: [] };

  // 건별 정산 행(결제일 = 주유일, 금액 같음)
  const perTx = rows.filter(r => r.count <= 1);
  const agg   = rows.filter(r => r.count > 1);
  const keys = new Set();
  const used = new Set();
  for (const r of perTx) {
    const t = cands.find(x => !used.has(x) && ymOf(x.date) === ym &&
      String(x.date).replace(/\//g, '-') === r.payDate &&
      (Number(x.amount) === r.amount || Number(cardByApproval?.get(String(x.approvalNo))?.amount) === r.amount));
    if (t) { used.add(t); keys.add(txKey(t)); }
  }
  const rest = cands.filter(t => !used.has(t));
  const sAmount = rows.reduce((s, r) => s + r.amount, 0);
  if (agg.length) {
    const wantCount  = agg.reduce((s, r) => s + r.count, 0);
    const wantLiters = agg.reduce((s, r) => s + r.liters, 0);
    const restLiters = rest.reduce((s, t) => s + (Number(t.qty) || 0), 0);
    let picked = null, excluded = [];
    if (wantCount === rest.length && Math.abs(restLiters - wantLiters) <= LITER_TOL) picked = rest;
    else {
      const ex = findExclusion(rest, wantCount, wantLiters, agg.reduce((s, r) => s + r.amount, 0));
      if (ex) { excluded = ex.map(i => rest[i]); picked = rest.filter((_, i) => !ex.includes(i)); }
    }
    if (!picked) {
      return { ...base, status: 'mismatch', keys: [...keys], excluded: [],
               settleCount: wantCount + perTx.length, settleLiters: wantLiters, settleAmount: sAmount };
    }
    picked.forEach(t => keys.add(txKey(t)));
    const matchedAmount = cands.filter(t => keys.has(txKey(t))).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return { ...base, status: 'matched', keys: [...keys], excluded: excluded.map(txKey),
             settleCount: wantCount + perTx.length, settleLiters: wantLiters, settleAmount: sAmount,
             matchedAmount, amountDiff: sAmount - matchedAmount };
  }
  // 건별 정산만 있는 업체: 정산 행이 모두 거래와 맞으면 확인, 나머지 후보는 유가보조 아님
  const ok = keys.size === perTx.length;
  const matchedAmount = cands.filter(t => keys.has(txKey(t))).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  return { ...base, status: ok ? 'matched' : 'mismatch', keys: [...keys],
           excluded: ok ? rest.map(txKey) : [], settleCount: perTx.length, settleAmount: sAmount,
           matchedAmount, amountDiff: sAmount - matchedAmount };
}

// 화면·업로드 결과용 한 줄 요약
function describeMatch(name, r) {
  const won = n => Number(n || 0).toLocaleString();
  const m = Number(r.ym.slice(5));
  if (r.status === 'pending') return `${name} ${m}월: 정산 전 (카드승인 ${r.candidates}건 ${won(r.candAmount)}원 — 정산 내역 올라오면 확인)`;
  if (r.status === 'mismatch') {
    return `${name} ${m}월: 정산 불일치 — 정산 ${r.settleCount}건 ${won(r.settleLiters)}L ${won(r.settleAmount)}원 / BOS 카드승인 ${r.candidates}건 ${won(r.candLiters)}L ${won(r.candAmount)}원`;
  }
  let s = `${name} ${m}월: 정산 확인 ${r.keys.length}건 ${won(r.matchedAmount)}원`;
  if (r.excluded.length) s += `, 정산에 없는 ${r.excluded.length}건은 세금계산서 대상`;
  if (r.amountDiff) s += `, 금액 차이 ${r.amountDiff > 0 ? '+' : ''}${won(r.amountDiff)}원`;
  if (r.cardDiffs.length) {
    s += ` (BOS·카드 금액 다름: ${r.cardDiffs.map(d => `${String(d.tx.date).slice(5)} BOS ${won(d.tx.amount)} / 카드 ${won(d.cardAmount)}`).join(', ')})`;
  }
  return s;
}

module.exports = {
  parseSubsidySettlement, isSubsidySettlementSheet, mergeSettlements,
  matchVendorMonth, describeMatch, usageMonthOf, txKey, FUELS,
};
