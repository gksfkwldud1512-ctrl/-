'use strict';
// 외상 입금 매칭 학습·자동 매칭
//
// 1) learnFromNotes: 사장님이 통장 비고에 적어 둔 "N월"을 정답으로 보고, 입금마다 업체·대상월을 확정한다.
//    (입금자명 + 비고 속 업체 단서 + 그 달 외상 금액으로 업체를 찾음)
// 2) buildProfiles: 확정 결과로 업체별 결제 특징(입금자명·입금 지연·할인·합산 입금)을 뽑는다.
// 3) autoMatch: 비고 없이 입금자명·금액·지연 범위만으로 업체·월을 찾는다. 하나로 정해질 때만 확정.
//
// 순수 계산만 — 파일 저장은 server.js가 한다.

const { normalize, vendorSimilarity, stripBankSuffix, stripCorpMarkers } = require('./bankExpenseParser');
const { extractMonthHint } = require('./arNoteParser');

const normName = s => normalize(stripCorpMarkers(stripBankSuffix(s)));

// 금액이 "같다"고 보는 허용폭 (원단위 절사·이체수수료 정도)
const AMOUNT_TOL = 100;
// 큰 금액은 0.1% 이내 차이까지 같은 금액으로 (이체 수수료·원단위 조정 — 2천만원에 2만원)
const REL_TOL = 0.001;
// 비고 학습 때 "비슷한 금액"으로 업체를 고를 때 허용 비율 (할인 업체 감안)
const LEARN_NEAR_RATIO = 0.03;

function ymShift(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthDiff(fromYm, toYm) {
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// 업체×월 외상 → Map(vendor → Map(month → charge))
function chargeMap(arMatrix) {
  const map = new Map();
  for (const [v, list] of arMatrix.byVendor) map.set(v, new Map(list.map(x => [x.month, Math.round(x.charge)])));
  return map;
}

// ── 비고 속 업체 단서 ─────────────────────────────────────────
// 비고에서 월·숫자·흔한 말을 빼고 남은 2글자 이상 단어 → 업체명에 들어 있으면 그 업체 단서
const NOTE_STOPWORDS = new Set(['월', '입금', '배달', '미수', '잔액', '유외상품', '유외', '상품', '정산', '거래종료',
  '외상', '세차', '선입', '포함', '남음', '주유분', '구매', '상품권', '통장입금', '계좌이체', '버스']);

function noteTokens(note) {
  return (String(note || '').match(/[가-힣A-Za-z]{2,}/g) || [])
    .map(t => t.toLowerCase())
    .filter(t => !NOTE_STOPWORDS.has(t) && !/^\d+월$/.test(t));
}

function keywordVendors(note, vendorNorms) {
  const toks = noteTokens(note);
  if (!toks.length) return { vendors: [], tokens: [] };
  const hit = new Map();
  for (const [v, n] of vendorNorms) {
    const t = toks.find(t => n.includes(t));
    if (t) hit.set(v, t);
  }
  return { vendors: [...hit.keys()], tokens: [...new Set(hit.values())] };
}

// ── 1) 비고로 정답 배정 ──────────────────────────────────────
// deposits: parseBankIncoming 결과 [{date, month, payer, amount, note}]
// aliasIndex: arLedger.buildVendorAliasIndex 결과, matchPayer: arLedger.matchPayerToVendor
// → [{ dep, vendor, months:[{month, amount}], basis, confidence, hint, keywordTokens, splits:[{vendor, month, amount}] }]
function learnFromNotes(deposits, arMatrix, { aliasIndex, matchPayer, isIgnored = () => false }) {
  const charges = chargeMap(arMatrix);
  const vendorNorms = [...charges.keys()].map(v => [v, normName(v)]);
  const out = [];

  for (const dep of deposits) {
    if (!dep.note || isIgnored(dep.payer)) continue;
    const hint = extractMonthHint(dep.note, dep.date);
    const byName = matchPayer(dep.payer, aliasIndex);
    const kw = keywordVendors(dep.note, vendorNorms);
    const near = (v, m) => {
      const c = charges.get(v)?.get(m);
      return c && Math.abs(c - dep.amount) <= Math.max(AMOUNT_TOL, c * LEARN_NEAR_RATIO);
    };

    let vendor = null, basis = '', confidence = 0;
    // ① 비고에 업체 단서가 있으면 우선 (같은 입금자가 다른 업체 몫을 보내는 경우: 천평→중앙복층, 하나→하나관광)
    if (kw.vendors.length === 1) { vendor = kw.vendors[0]; basis = 'note-keyword'; confidence = 0.95; }
    else if (kw.vendors.length > 1 && hint) {
      const fit = kw.vendors.filter(v => near(v, hint));
      if (fit.length === 1) { vendor = fit[0]; basis = 'note-keyword+amount'; confidence = 0.95; }
    }
    // ② 입금자명
    if (!vendor && byName.name) { vendor = byName.name; basis = 'payer-name'; confidence = byName.score; }
    // ③ 이름이 비슷하고(추천) 그 달 금액이 맞는 업체
    if (!vendor && byName.suggestion && hint && near(byName.suggestion.name, hint)) {
      vendor = byName.suggestion.name; basis = 'payer-similar+amount'; confidence = 0.85;
    }
    // ④ 그 달 금액이 딱 맞는 업체가 하나뿐 (입금자명이 전혀 다른 경우: "주식회사 하나항공여" 등)
    if (!vendor && hint) {
      const exact = [...charges.keys()].filter(v => {
        const c = charges.get(v).get(hint);
        return c && Math.abs(c - dep.amount) <= AMOUNT_TOL;
      });
      if (exact.length === 1) { vendor = exact[0]; basis = 'amount-unique'; confidence = 0.8; }
    }
    if (!vendor) { out.push({ dep, vendor: null, months: [], basis: 'unresolved', confidence: 0, hint, keywordTokens: kw.tokens }); continue; }

    // 대상 월 (여러 달·합산 입금 처리)
    const vc = charges.get(vendor) || new Map();
    let months = [], splits = [];
    if (hint && vc.has(hint)) {
      const c = vc.get(hint);
      if (Math.abs(c - dep.amount) <= Math.max(AMOUNT_TOL, c * LEARN_NEAR_RATIO)) {
        months = [{ month: hint, amount: dep.amount }];
      } else {
        // 비고 월에서 끝나거나 시작하는 연속 달 합계
        const win = findRun(vc, hint, dep.amount);
        if (win) months = win;
        else {
          // 다른 업체 몫이 섞임 (현대스크랩+명신) — 같은 달 다른 업체 외상 = 차액
          const rest = dep.amount - c;
          const partner = rest > 0 ? [...charges.keys()].find(w => w !== vendor && (() => {
            const wc = charges.get(w).get(hint);
            return wc && Math.abs(wc - rest) <= AMOUNT_TOL;
          })()) : null;
          if (partner) {
            months = [{ month: hint, amount: c }];
            splits = [{ vendor: partner, month: hint, amount: rest }];
          } else {
            months = [{ month: hint, amount: dep.amount }];   // 차이 있음 — 점검 화면에서 확인
          }
        }
      }
    } else if (hint) {
      months = [{ month: hint, amount: dep.amount }];          // 그 달 외상 기록 없음 (추적 전 등)
    }
    out.push({ dep, vendor, months, splits, basis, confidence, hint, keywordTokens: kw.tokens });
  }
  return out;
}

// 비고 월(hint)을 포함하는 연속 달(최대 4개월) 합계가 입금액과 맞으면 그 달들
function findRun(vc, hint, amount) {
  for (let len = 2; len <= 4; len++) {
    for (let start = -(len - 1); start <= 0; start++) {
      const ms = Array.from({ length: len }, (_, i) => ymShift(hint, start + i));
      if (!ms.every(m => vc.has(m))) continue;
      const sum = ms.reduce((s, m) => s + vc.get(m), 0);
      if (Math.abs(sum - amount) <= AMOUNT_TOL) return ms.map(m => ({ month: m, amount: vc.get(m) }));
    }
  }
  return null;
}

// ── 2) 업체별 결제 특징 ─────────────────────────────────────
// learned: learnFromNotes 결과, extra: { cardVendors:Set, otherVendors:Set }
function buildProfiles(learned, arMatrix, extra = {}) {
  const charges = chargeMap(arMatrix);
  const profiles = {};
  const get = v => (profiles[v] ||= { payType: null, payers: [], lagMonths: null, discount: null,
    payGroup: null, noteKeywords: [], confirmed: false, memo: '', stats: { deposits: 0, lags: {} } });

  for (const a of learned) {
    if (!a.vendor) continue;
    const p = get(a.vendor);
    p.stats.deposits++;
    // 입금자명은 근거와 무관하게 모두 등록 — 같은 입금자가 여러 업체 몫을 보내면(건국유업→본계정·노사TFT,
    // 천평솔루션→자기·중앙복층) 자동 매칭 때 그 업체들 중 금액이 맞는 쪽을 고른다
    const payer = stripBankSuffix(a.dep.payer);
    if (payer && !p.payers.includes(payer)) p.payers.push(payer);
    a.keywordTokens.forEach(t => { if (normName(a.vendor).includes(t) && !p.noteKeywords.includes(t)) p.noteKeywords.push(t); });
    a.months.forEach(m => {
      const lag = monthDiff(m.month, a.dep.month);
      p.stats.lags[lag] = (p.stats.lags[lag] || 0) + 1;
    });
    a.splits.forEach(s => {
      const sp = get(s.vendor);
      sp.payGroup = a.vendor;
      sp.stats.groupCount = (sp.stats.groupCount || 0) + 1;
    });
  }
  // 입금자가 다른 업체 몫도 보내는 경우(같은 입금자명이 여러 업체 payers에 있음) — 비고 단서 필요 표시

  for (const [v, p] of Object.entries(profiles)) {
    // 입금 지연: 가장 흔한 지연 ~ 두 번째로 흔한 지연 (하나뿐이면 그 값 ±1, 최소 0)
    const lags = Object.entries(p.stats.lags).map(([l, n]) => [Number(l), n]).sort((a, b) => b[1] - a[1]);
    if (lags.length) {
      const top = lags.filter(([, n]) => n >= 2 || n / p.stats.deposits >= 0.2).map(([l]) => l);
      const pick = top.length ? top : [lags[0][0]];
      p.lagMonths = [Math.max(0, Math.min(...pick)), Math.max(...pick)];
    }
    // 할인: 한 달 한 입금으로 받은 달의 부족 비율이 매번 비슷하면 (제론텍 약 1.4%)
    // 달별 입금 합계 (한 달 치를 여러 번 나눠 보낸 것도 합침) 대비 부족 비율·금액
    const paidByMonth = new Map();
    for (const a of learned.filter(x => x.vendor === v && !x.splits.length)) {
      a.months.forEach(m => paidByMonth.set(m.month, (paidByMonth.get(m.month) || 0) + m.amount));
    }
    const shortRatios = [];
    for (const [m, paid] of paidByMonth) {
      const c = charges.get(v)?.get(m);
      if (c && paid < c - AMOUNT_TOL) shortRatios.push((c - paid) / c);
    }
    const shortAbs = [...paidByMonth].map(([m, paid]) => (charges.get(v)?.get(m) || 0) - paid).filter(x => x > AMOUNT_TOL);
    const mostlyShort = shortRatios.length >= 3 && shortRatios.length >= paidByMonth.size * 0.5;
    if (mostlyShort) {
      const sorted = shortRatios.slice().sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const consistent = sorted.filter(r => Math.abs(r - med) <= 0.004).length / sorted.length >= 0.7;
      if (consistent && med >= 0.003 && med <= 0.05) p.discount = { rate: Math.round(med * 10000) / 10000 };
    }
    // 나눠 내는 업체: 절반 이상의 달을 3번 이상 나눠 입금 (도원아이디 — 주유할 때마다 입금)
    const depsPerMonth = new Map();
    learned.filter(x => x.vendor === v).forEach(a => a.months.forEach(m => depsPerMonth.set(m.month, (depsPerMonth.get(m.month) || 0) + 1)));
    const splitMonths = [...depsPerMonth.values()].filter(n => n >= 3).length;
    p.installments = depsPerMonth.size >= 2 && splitMonths >= depsPerMonth.size * 0.5;
    // 고정액 할인: 부족액이 매번 거의 같은 금액 (중앙안전유리 약 95,700원)
    if (!p.discount && mostlyShort && shortAbs.length >= 3) {
      const sorted = shortAbs.slice().sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const consistent = sorted.filter(x => Math.abs(x - med) <= 1000).length / sorted.length >= 0.6;
      if (consistent && med <= 500000) p.discount = { fixed: Math.round(med) };
    }
  }

  // 통장 입금이 없는 업체 — 현장카드/기타 후보 (사장님이 점검 화면에서 확정)
  for (const v of charges.keys()) {
    const p = get(v);
    if (p.stats.deposits > 0) p.payType = 'bank';
    else if ((extra.cardVendors || new Set()).has(v)) p.payType = 'card';
    else if (/보관|대표|현금|면세/.test(v)) p.payType = 'other';
    else p.payType = null;   // 미정
    if (p.payGroup && p.stats.deposits === 0) p.payType = 'bank';   // 다른 업체 입금에 합산되어 들어옴
  }
  return profiles;
}

// ── 3) 비고 없이 자동 매칭 ──────────────────────────────────
// deposits: [{date, month, payer, amount, ...}], profiles: buildProfiles 결과(+사람이 고친 값)
// opts.fixed: Map(depositKey → {vendor, months, splits}) — 이미 사람이 확정한 입금 (먼저 반영해 잔액에서 뺌)
// opts.forceVendor: Map(depositKey → 업체명) — 업체만 사람이 정한 입금 (월은 자동으로 찾음)
// → [{ dep, vendor, months:[{month,amount}], splits, status, candidates, groupKeys? }]
//   status: 'auto'(자동 확정) | 'fixed'(사람 확정) | 'ambiguous'(후보 여럿) | 'no-amount'(업체는 알지만 금액 안 맞음)
//           | 'no-vendor'(업체 모름) | 'ignored'(외상 무관 입금)
// 한 달 치를 같은 입금자가 며칠 안에 여러 번 나눠 보내면(디비엘·나람) 그 묶음 합계로도 맞춰 본다.
const CLUSTER_DAYS = 7;
const CLUSTER_MAX  = 4;

function autoMatch(deposits, arMatrix, profiles, { aliasIndex, matchPayer, isIgnored = () => false, fixed = new Map(), forceVendor = new Map(), keyOf = d => `${d.date}|${d.payer}|${d.amount}` } = {}) {
  const charges = chargeMap(arMatrix);
  const remaining = new Map([...charges].map(([v, m]) => [v, new Map(m)]));
  const take = (v, month, amt) => { const r = remaining.get(v); if (r?.has(month)) r.set(month, r.get(month) - amt); };

  // 입금자명 → 업체들 (프로필 payers, 정규화 일치)
  const payerIndex = new Map();
  for (const [v, p] of Object.entries(profiles)) {
    (p.payers || []).forEach(name => {
      const n = normName(name);
      if (!n) return;
      if (!payerIndex.has(n)) payerIndex.set(n, new Set());
      payerIndex.get(n).add(v);
    });
  }
  // 합산 입금: 받는 업체 → [합쳐지는 업체]
  const groupOf = new Map();
  for (const [v, p] of Object.entries(profiles)) if (p.payGroup) {
    if (!groupOf.has(p.payGroup)) groupOf.set(p.payGroup, []);
    groupOf.get(p.payGroup).push(v);
  }
  const vendorsOf = dep => {
    const forced = forceVendor.get(keyOf(dep));   // 사람이 업체만 지정한 입금
    if (forced) return [forced];
    let vs = [...(payerIndex.get(normName(dep.payer)) || [])];
    if (!vs.length) { const m = matchPayer(dep.payer, aliasIndex); if (m.name) vs = [m.name]; }
    return vs;
  };

  // 입금액(amount)이 맞는 배정 후보들 — 한 달 / 연속 달 / 합산 업체
  function optionsFor(vendors, amount, depMonth) {
    const options = [];
    for (const v of vendors) {
      const p = profiles[v] || {};
      const r = remaining.get(v);
      if (!r) continue;
      const [lo, hi] = p.lagMonths || [1, 2];
      // 입금 지연보다 이른 달(예: 보통 한 달 뒤 내는 업체의 이번 달)은 아직 낼 때가 아니므로 제외
      const cand = [...r.keys()].filter(m => m <= depMonth && monthDiff(m, depMonth) >= lo
        && monthDiff(m, depMonth) <= Math.max(5, hi) && r.get(m) > AMOUNT_TOL).sort();
      const rate = p.discount?.rate || 0, fixedDisc = p.discount?.fixed || 0;
      const fits = target => Math.abs(target - amount) <= Math.max(AMOUNT_TOL, target * REL_TOL)
        || (rate && Math.abs(target * (1 - rate) - amount) <= Math.max(AMOUNT_TOL, target * 0.004))
        || (fixedDisc && Math.abs(target - fixedDisc - amount) <= 1000);
      const inLag = m => { const l = monthDiff(m, depMonth); return l >= lo && l <= hi; };
      for (const m of cand) if (fits(r.get(m))) options.push({ vendor: v, months: [{ month: m, amount }], splits: [], inLag: inLag(m) });
      for (let i = 0; i < cand.length; i++) for (let len = 2; len <= 4 && i + len <= cand.length; len++) {
        const ms = cand.slice(i, i + len);
        if (monthDiff(ms[0], ms[ms.length - 1]) !== len - 1) break;
        const sum = ms.reduce((s, m) => s + r.get(m), 0);
        if (fits(sum)) {
          let left = amount;
          options.push({ vendor: v, splits: [], inLag: inLag(ms[ms.length - 1]),
            months: ms.map((m, k) => { const a = k === ms.length - 1 ? left : r.get(m); left -= a; return { month: m, amount: a }; }) });
        }
      }
      for (const w of groupOf.get(v) || []) {
        const wr = remaining.get(w);
        for (const m of cand) {
          const wm = wr?.get(m) || 0;
          if (wm > AMOUNT_TOL && Math.abs(r.get(m) + wm - amount) <= AMOUNT_TOL) {
            options.push({ vendor: v, months: [{ month: m, amount: r.get(m) }], splits: [{ vendor: w, month: m, amount: amount - r.get(m) }], inLag: inLag(m) });
          }
        }
      }
    }
    return options;
  }

  // 지연 범위 안의 것 우선, 그 안에서 하나뿐이면 확정. 같은 업체 같은 금액 달이 여럿이면 가장 오래된 달
  function choose(options) {
    const pool = options.some(o => o.inLag) ? options.filter(o => o.inLag) : options;
    if (pool.length === 1) return { pick: pool[0], pool };
    if (pool.length > 1 && new Set(pool.map(o => o.vendor)).size === 1) {
      const oldest = pool.slice().sort((a, b) => a.months[0].month.localeCompare(b.months[0].month));
      if (oldest[0].months[0].month !== oldest[1].months[0].month) return { pick: oldest[0], pool };
    }
    return { pick: null, pool };
  }

  const sorted = deposits.slice().sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  for (const d of sorted) {
    const f = fixed.get(keyOf(d));
    if (f) { f.months.forEach(m => take(f.vendor, m.month, m.amount)); (f.splits || []).forEach(s => take(s.vendor, s.month, s.amount)); }
  }

  const done = new Map();   // key → 결과
  const dayGap = (a, b) => Math.round((new Date(b.date) - new Date(a.date)) / 86400000);
  for (const dep of sorted) {
    const k = keyOf(dep);
    if (done.has(k)) continue;
    const f = fixed.get(k);
    if (f) { done.set(k, { dep, vendor: f.vendor, months: f.months, splits: f.splits || [], status: 'fixed', candidates: [] }); continue; }
    if (isIgnored(dep.payer, dep)) { done.set(k, { dep, vendor: null, months: [], splits: [], status: 'ignored', candidates: [] }); continue; }

    const vendors = vendorsOf(dep);
    if (!vendors.length) { done.set(k, { dep, vendor: null, months: [], splits: [], status: 'no-vendor', candidates: [] }); continue; }

    let { pick, pool } = choose(optionsFor(vendors, dep.amount, dep.month));
    let group = [dep];
    // 나눠 내는 업체(installments): 지연 범위 안에서 아직 받을 돈이 이 입금 이상 남은 가장 오래된 달에 쌓음
    if (!pick && !pool.length && vendors.length === 1 && profiles[vendors[0]]?.installments) {
      const v = vendors[0], p = profiles[v], r = remaining.get(v);
      const [lo, hi] = p.lagMonths || [0, 1];
      const m = [...(r?.keys() || [])].sort().find(m => {
        const l = monthDiff(m, dep.month);
        return l >= lo && l <= hi && r.get(m) >= dep.amount - AMOUNT_TOL;
      });
      if (m) pick = { vendor: v, months: [{ month: m, amount: dep.amount }], splits: [], installment: true };
    }
    if (!pick && !pool.length) {
      // 같은 입금자가 며칠 안에 나눠 보낸 입금 묶음 (이 입금 포함 2~4건) 합계로 다시 찾기
      const pn = normName(dep.payer);
      const mates = sorted.filter(x => x !== dep && !done.has(keyOf(x)) && !fixed.has(keyOf(x)) && normName(x.payer) === pn
        && Math.abs(dayGap(dep, x)) <= CLUSTER_DAYS).slice(0, 6);
      const combos = [];
      const rec = (start, cur) => {
        if (cur.length >= 1) combos.push(cur.slice());
        if (cur.length === CLUSTER_MAX - 1) return;
        for (let j = start; j < mates.length; j++) { cur.push(mates[j]); rec(j + 1, cur); cur.pop(); }
      };
      rec(0, []);
      const found = [];
      for (const c of combos) {
        const members = [dep, ...c];
        const sum = members.reduce((s, x) => s + x.amount, 0);
        const r = choose(optionsFor(vendors, sum, members.map(x => x.month).sort().pop()));
        if (r.pick) found.push({ pick: r.pick, members });
      }
      // 묶음이 하나로 정해질 때만 (가장 적은 건수 묶음이 유일)
      if (found.length) {
        const minLen = Math.min(...found.map(x => x.members.length));
        const best = found.filter(x => x.members.length === minLen);
        if (best.length === 1) { pick = best[0].pick; group = best[0].members; }
      }
    }

    if (pick) {
      pick.months.forEach(m => take(pick.vendor, m.month, m.amount));
      pick.splits.forEach(s => take(s.vendor, s.month, s.amount));
      if (group.length === 1) {
        done.set(k, { dep, vendor: pick.vendor, months: pick.months, splits: pick.splits, status: 'auto', candidates: [] });
      } else {
        // 묶음: 각 입금은 자기 금액만큼 같은 달에 배정 (여러 달이면 첫 달부터 채움)
        const groupKeys = group.map(keyOf);
        const queue = pick.months.map(m => ({ ...m }));
        group.forEach(x => {
          let left = x.amount; const ms = [];
          for (const q of queue) {
            if (left <= 0) break;
            if (q.amount <= 0) continue;
            const a = q === queue[queue.length - 1] ? left : Math.min(left, q.amount);
            ms.push({ month: q.month, amount: a }); q.amount -= a; left -= a;
          }
          done.set(keyOf(x), { dep: x, vendor: pick.vendor, months: ms, splits: [], status: 'auto', candidates: [], groupKeys });
        });
      }
    } else {
      done.set(k, { dep, vendor: vendors.length === 1 ? vendors[0] : null, months: [], splits: [],
        status: pool.length ? 'ambiguous' : 'no-amount', candidates: pool.slice(0, 5) });
    }
  }
  return sorted.map(d => done.get(keyOf(d)));
}

module.exports = { learnFromNotes, buildProfiles, autoMatch, keywordVendors, noteTokens, normName, monthDiff, ymShift, AMOUNT_TOL };
