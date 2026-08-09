'use strict';
const fs   = require('fs');
const path = require('path');
const { normalize, vendorSimilarity } = require('./bankExpenseParser');

// ── 업체×월 외상매출(거래대금) 매트릭스 ──────────────────────────
// data/vendors_YYYY_MM.json 전체를 순회해 hasCredit 업체만 집계
function buildArMatrix(dataDir) {
  const files = fs.readdirSync(dataDir)
    .filter(f => /^vendors_\d{4}_\d{2}\.json$/.test(f))
    .sort();

  const months = [];              // ['2026-04', ...] 오름차순
  const byVendor = new Map();     // name -> [{month, charge}]

  files.forEach(f => {
    const m = f.match(/^vendors_(\d{4})_(\d{2})\.json$/);
    const ym = `${m[1]}-${m[2]}`;
    months.push(ym);

    const vendors = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    vendors.filter(v => v.hasCredit && v.totalCredit > 0).forEach(v => {
      if (!byVendor.has(v.name)) byVendor.set(v.name, []);
      byVendor.get(v.name).push({ month: ym, charge: v.totalCredit });
    });
  });

  return { months, byVendor };
}

// 업체명뿐 아니라 대표자명/담당자명도 별칭으로 등록 — 통장 입금은 개인명으로
// 찍히는 경우가 흔하기 때문. customers.json에 등록된 업체만 별칭 추가됨.
function buildVendorAliasIndex(vendorNames, customers) {
  const aliases = [];
  vendorNames.forEach(name => {
    aliases.push({ norm: normalize(name), vendorName: name });
    const c = customers.find(x => x.name === name);
    if (c?.ceoName && c.ceoName !== name) aliases.push({ norm: normalize(c.ceoName), vendorName: name });
    if (c?.contactName && c.contactName !== name && c.contactName !== c.ceoName) {
      aliases.push({ norm: normalize(c.contactName), vendorName: name });
    }
  });
  return aliases;
}

// ── 거래처명 매칭: 입금자명(적요1) → AR 대상 업체명 ───────────────
// 금액 매칭이므로 보수적으로: 정확 일치(1.0) 또는 포함관계(0.9)만 자동 채택.
// 그 사이(접두사 기반, 0.6~0.9 미만)는 오매칭 위험이 있어 자동 적용하지 않고
// "추천 후보"로만 반환 — 화면에서 사람이 한 번 확인 후 확정해야 함.
const AUTO_MATCH_MIN = 0.9;

function matchPayerToVendor(payer, aliasIndex) {
  const norm = normalize(payer);
  if (!norm) return { name: null, score: 0, suggestion: null };

  let best = null, bestScore = 0, ambiguous = false;
  for (const a of aliasIndex) {
    const score = vendorSimilarity(norm, a.norm);
    if (score > bestScore) { best = a.vendorName; bestScore = score; ambiguous = false; }
    else if (score > 0 && score === bestScore && a.vendorName !== best) { ambiguous = true; }
  }

  if (bestScore >= AUTO_MATCH_MIN && !ambiguous) {
    return { name: best, score: bestScore, suggestion: null };
  }
  // 0.6 이상이면 추천만 (자동확정 X)
  const suggestion = (bestScore >= 0.6 && !ambiguous) ? { name: best, score: bestScore } : null;
  return { name: null, score: bestScore, suggestion };
}

// ── FIFO 배분: 업체별 입금(matchedVendor 있는 것)을 날짜순으로,
//    가장 오래된 미수 월부터 순차 충당 ───────────────────────────
// 반환: { vendor: { months:[{month,charge,paid,remaining}], allocations:[{depositId,date,amount,appliedTo:[{month,amount}]}], totalCharge, totalPaid, remaining, surplus } }
function allocateFifo(arMatrix, deposits) {
  const result = {};

  for (const [vendor, monthCharges] of arMatrix.byVendor) {
    const months = monthCharges
      .slice()
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ month: m.month, charge: m.charge, paid: 0, remaining: m.charge }));

    const vendorDeposits = deposits
      .filter(d => d.matchedVendor === vendor)
      .sort((a, b) => a.date.localeCompare(b.date));

    const allocations = [];
    let surplus = 0;

    for (const dep of vendorDeposits) {
      let left = dep.amount;
      const appliedTo = [];
      for (const m of months) {
        if (left <= 0) break;
        if (m.remaining <= 0) continue;
        const applied = Math.min(left, m.remaining);
        m.paid      += applied;
        m.remaining -= applied;
        left        -= applied;
        appliedTo.push({ month: m.month, amount: applied });
      }
      if (left > 0) surplus += left;   // 모든 미수를 충당하고 남은 금액(선입금)
      allocations.push({ depositId: dep.id, date: dep.date, amount: dep.amount, appliedTo });
    }

    const totalCharge = months.reduce((s, m) => s + m.charge, 0);
    const totalPaid   = months.reduce((s, m) => s + m.paid, 0);

    result[vendor] = {
      months, allocations,
      totalCharge, totalPaid,
      remaining: totalCharge - totalPaid,
      surplus,
    };
  }

  return result;
}

module.exports = { buildArMatrix, buildVendorAliasIndex, matchPayerToVendor, allocateFifo };
