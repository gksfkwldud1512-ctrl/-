'use strict';
const fs   = require('fs');
const path = require('path');
const { normalize, vendorSimilarity, stripBankSuffix, stripCorpMarkers } = require('./bankExpenseParser');

// AR 매칭 전용 정규화: 은행 접미사("/타행이체")·법인 표기("(주)" 등 위치 차이) 제거 후 일반 정규화.
// bankExpenseParser의 normalize()는 다른 용도(지출 분류)에도 쓰이므로 여기서 별도 래핑.
function normalizeForMatch(s) {
  return normalize(stripCorpMarkers(stripBankSuffix(s)));
}

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

// 업체명뿐 아니라 대표자명/담당자명, 그리고 사람이 직접 등록한 입금계좌명(aliasMap)도
// 별칭으로 등록 — 통장 입금은 개인명·전혀 다른 사업장명으로 찍히는 경우가 흔하기 때문.
// aliasMap: { 업체명: [입금계좌명, ...] } — 사람이 확정한 것이므로 항상 정확일치(1.0) 취급.
function buildVendorAliasIndex(vendorNames, customers, aliasMap = {}) {
  const aliases = [];
  vendorNames.forEach(name => {
    aliases.push({ norm: normalizeForMatch(name), vendorName: name });
    const c = customers.find(x => x.name === name);
    if (c?.ceoName && c.ceoName !== name) aliases.push({ norm: normalizeForMatch(c.ceoName), vendorName: name });
    if (c?.contactName && c.contactName !== name && c.contactName !== c.ceoName) {
      aliases.push({ norm: normalizeForMatch(c.contactName), vendorName: name });
    }
    (aliasMap[name] || []).forEach(alias => {
      aliases.push({ norm: normalizeForMatch(alias), vendorName: name, manual: true });
    });
  });
  return aliases;
}

// ── 거래처명 매칭: 입금자명(적요1) → AR 대상 업체명 ───────────────
// 금액 매칭이므로 보수적으로: 정확 일치(1.0) 또는 포함관계(0.9)만 자동 채택.
// 그 사이(접두사 기반, 0.6~0.9 미만)는 오매칭 위험이 있어 자동 적용하지 않고
// "추천 후보"로만 반환 — 화면에서 사람이 한 번 확인 후 확정해야 함.
const AUTO_MATCH_MIN = 0.9;

function matchPayerToVendor(payer, aliasIndex) {
  const norm = normalizeForMatch(payer);
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

const { extractMonthHint } = require('./arNoteParser');

// 두 "YYYY-MM" 사이 개월 차 (양수 = to가 from보다 늦음)
function monthDiff(fromYm, toYm) {
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// 그리디 윈도우(3순위) 자동채택 임계값 — 절대 5만원 또는 입금액의 20% 중 큰 쪽
const WINDOW_DIFF_ABS   = 50000;
const WINDOW_DIFF_RATIO = 0.2;

// 입금(matchedVendor 있는 것)을 업체별 "배분 단위(unit)"로 분해.
// 분할(splits)이 있으면 주몫(primary)과 분할몫을 각각 별도 유닛으로 만들어
// 서로 다른 업체의 계산에 들어가게 한다 — 한 입금이 여러 업체에 걸치는 경우
// (예: 현대스크랩 입금 중 일부가 명신 몫) 지원의 핵심.
function decomposeUnits(deposits) {
  const units = [];
  for (const d of deposits) {
    if (!d.matchedVendor) continue;
    const splits = d.splits || [];
    const splitTotal = splits.reduce((s, x) => s + x.amount, 0);
    const primaryAmount = d.amount - splitTotal;
    if (primaryAmount !== 0) {
      units.push({
        depositId: d.id, vendorName: d.matchedVendor, amount: primaryAmount,
        date: d.date, note: d.note || '', manualMonthAssign: d.monthAssign || null,
        isSplit: false, splitIndex: null, sourceFragment: null,
      });
    }
    splits.forEach((s, idx) => {
      units.push({
        depositId: d.id, vendorName: s.vendorName, amount: s.amount,
        date: d.date, note: d.note || '', manualMonthAssign: s.monthAssign || null,
        isSplit: true, splitIndex: idx, sourceFragment: s.sourceFragment || null,
      });
    });
  }
  return units;
}

// 비고의 분할 조각("명신")을 실제 업체명으로 역매칭.
// matchPayerToVendor와 동일한 자동채택 기준(0.9 이상, 비모호) 재사용.
function resolveSplitFragment(fragment, aliasIndex) {
  return matchPayerToVendor(fragment, aliasIndex).name;
}

// 금액 기반 최적 조합 탐색. 아직 입금이 안 닿은(paid===0) 가장 오래된 달부터
// 시작해서, 연속으로 달을 하나씩 늘려가며 누적합과 입금액의 차이가 줄어드는
// 동안만 확장(그 이상 넓혀도 안 좋아지면 중단). 윈도우 내 앞 달들은 charge
// 그대로 채우고 마지막(가장 최근) 달이 차액을 흡수.
// forceAccept=true면 임계값 무시하고 항상 반환(3순위 "추천값"용).
function findGreedyWindow(months, amount, forceAccept = false) {
  const startIdx = months.findIndex(m => m.paid === 0);
  if (startIdx < 0) return null;

  const window = [months[startIdx]];
  let cum = months[startIdx].charge;
  let bestDiff = Math.abs(cum - amount);

  for (let i = startIdx + 1; i < months.length && months[i].paid === 0; i++) {
    const newCum = cum + months[i].charge;
    const newDiff = Math.abs(newCum - amount);
    if (newDiff < bestDiff) { window.push(months[i]); cum = newCum; bestDiff = newDiff; }
    else break;
  }

  if (!forceAccept) {
    const threshold = Math.max(WINDOW_DIFF_ABS, amount * WINDOW_DIFF_RATIO);
    if (bestDiff > threshold) return null;
  }

  const assignments = [];
  let remain = amount;
  window.forEach((m, i) => {
    const amt = (i === window.length - 1) ? remain : Math.min(remain, m.charge);
    assignments.push({ month: m.month, amount: amt });
    remain -= amt;
  });
  return { assignments, diff: bestDiff };
}

// ── 입금 배분(신규): 비고 힌트 → 금액기반 추정 → 미확정, 4단계 우선순위 ──
// 한 달의 초과분으로 다른 달 부족분을 메꾸는 상계를 하지 않는다. 다만 "한
// 입금이 여러 연속된 달 합계와 정확히(근접) 일치"하면 그 여러 달을 그 입금
// 하나로 정상 처리한다(2순위 그리디 윈도우) — 이건 상계가 아니라 정상 매칭.
// deposits는 mergeArDeposits에서 matchedVendor/splits/monthAssign까지 계산된 것.
// 반환: { vendor: { months:[{month,charge,paid,remaining,lagMonths}],
//         allocations:[{depositId,date,amount,note,isSplit,appliedTo,source}],
//         unresolved:[...], totalCharge, totalPaid, remaining, surplus, beforeTrackCount } }
function allocateArDeposits(arMatrix, deposits) {
  const result = {};
  const units = decomposeUnits(deposits);
  const unitsByVendor = new Map();
  units.forEach(u => {
    if (!unitsByVendor.has(u.vendorName)) unitsByVendor.set(u.vendorName, []);
    unitsByVendor.get(u.vendorName).push(u);
  });

  const unitMeta = u => ({
    depositId: u.depositId, date: u.date, amount: u.amount, note: u.note,
    isSplit: u.isSplit, splitIndex: u.splitIndex, sourceFragment: u.sourceFragment,
  });

  for (const [vendor, monthCharges] of arMatrix.byVendor) {
    const months = monthCharges
      .slice()
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ month: m.month, charge: m.charge, paid: 0, remaining: m.charge, lagMonths: null }));
    const monthByYm = new Map(months.map(m => [m.month, m]));
    const trackStart = months.length ? months[0].month : null;

    const vendorUnits = (unitsByVendor.get(vendor) || []).slice().sort((a, b) => a.date.localeCompare(b.date));

    const allocations = [];
    const unresolved  = [];
    let surplus = 0;
    let beforeTrackCount  = 0;
    let beforeTrackAmount = 0;

    const applyToMonths = (assignments, unitDate) => {
      assignments.forEach(({ month, amount }) => {
        const m = monthByYm.get(month);
        if (!m) { surplus += amount; return; }
        m.paid += amount;                    // 같은 달에 여러 유닛이 오면 그 달 안에서 누적(상계 아님)
        m.remaining = m.charge - m.paid;      // 음수 = 그 달만 초과입금
        m.lagMonths = monthDiff(m.month, unitDate.slice(0, 7));
      });
    };

    for (const u of vendorUnits) {
      // 0순위: 수동 오버라이드
      if (u.manualMonthAssign && u.manualMonthAssign.length) {
        applyToMonths(u.manualMonthAssign, u.date);
        allocations.push({ ...unitMeta(u), appliedTo: u.manualMonthAssign, source: 'manual' });
        continue;
      }

      // 1순위: 비고 월힌트 — 사람이 직접 적어둔 정보라 최고 신뢰도로 취급
      const hintMonth = extractMonthHint(u.note, u.date);
      if (hintMonth) {
        if (trackStart && hintMonth < trackStart) {
          beforeTrackCount++;
          beforeTrackAmount += u.amount;
          allocations.push({ ...unitMeta(u), appliedTo: [], source: 'before-track' });
          continue;
        }
        if (monthByYm.has(hintMonth)) {
          applyToMonths([{ month: hintMonth, amount: u.amount }], u.date);
          allocations.push({ ...unitMeta(u), appliedTo: [{ month: hintMonth, amount: u.amount }], source: 'note' });
          continue;
        }
        // 힌트가 있지만 대상월이 매트릭스에 없음(추적 종료월 이후 등) → 강행하지 않고 2순위로 폴백
      }

      // 2순위: 금액기반 그리디 윈도우
      const win = findGreedyWindow(months, u.amount);
      if (win) {
        applyToMonths(win.assignments, u.date);
        allocations.push({ ...unitMeta(u), appliedTo: win.assignments, source: 'estimate' });
        continue;
      }

      // 3순위: 미확정 — 자동 배정하지 않고 사람이 수동 지정하도록 남김
      const suggested = findGreedyWindow(months, u.amount, true);
      unresolved.push({ ...unitMeta(u), suggestedWindow: suggested ? suggested.assignments : [] });
      allocations.push({ ...unitMeta(u), appliedTo: [], source: 'unresolved' });
    }

    const totalCharge = months.reduce((s, m) => s + m.charge, 0);
    const totalPaid   = months.reduce((s, m) => s + m.paid, 0);

    result[vendor] = {
      months, allocations, unresolved,
      totalCharge, totalPaid,
      remaining: totalCharge - totalPaid,
      surplus, beforeTrackCount, beforeTrackAmount,
    };
  }

  return result;
}

module.exports = {
  buildArMatrix, buildVendorAliasIndex, matchPayerToVendor,
  decomposeUnits, resolveSplitFragment, findGreedyWindow, allocateArDeposits,
};
