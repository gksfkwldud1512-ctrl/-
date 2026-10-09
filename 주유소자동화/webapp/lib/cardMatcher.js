'use strict';

/**
 * BOS 카드 거래 vs 이지샵 카드 거래 승인번호 기준 매칭
 * bosCards:  [{ approvalNo, cardCompany, cardNo, amount, product }]
 * easyCards: [{ approvalNo, cardCompany, cardNo, amount, fuel, transTime }]
 *
 * [추가 처리] BOS에 같은 승인번호가 여러 건(예: 세차 15,000 + 3,000)인 경우
 *            금액을 합산하여 이지샵 단일 거래(18,000)와 비교 → 합계 일치 시 정상 처리
 */
function matchCards(bosCards, easyCards, ctx = {}) {
  // BOS: 승인번호별 그룹화 + 금액 합산
  const bosMap = new Map();
  for (const t of bosCards) {
    if (!bosMap.has(t.approvalNo)) {
      bosMap.set(t.approvalNo, {
        approvalNo:  t.approvalNo,
        cardCompany: t.cardCompany,
        cardNo:      t.cardNo,
        totalAmount: 0,
        products:    [],
        bosPayType:  t.bosPayType || '신용카드',
      });
    }
    const g = bosMap.get(t.approvalNo);
    g.totalAmount += t.amount;
    const prod = (t.product || '').trim();
    if (prod && !g.products.includes(prod)) g.products.push(prod);
  }

  const easyMap = new Map(easyCards.map(t => [t.approvalNo, t]));

  const errors = [];

  // BOS 기준 체크
  for (const [no, bosGroup] of bosMap) {
    const easyTx = easyMap.get(no);
    const product = bosGroup.products.length > 0 ? bosGroup.products.join('+') : '미분류';
    if (!easyTx) {
      // 외상 거래가 이지샵에 없으면 오류 아님 (별도 단말기 처리 등)
      if (bosGroup.bosPayType === '외상') continue;
      errors.push({
        type:        'bos_only',
        approvalNo:  no,
        cardCompany: bosGroup.cardCompany,
        cardNo:      bosGroup.cardNo,
        product,
        bosAmount:   bosGroup.totalAmount,
        easyAmount:  null,
        diff:        bosGroup.totalAmount,
      });
    } else if (bosGroup.totalAmount !== easyTx.amount) {
      errors.push({
        type:        'amount_mismatch',
        approvalNo:  no,
        cardCompany: bosGroup.cardCompany,
        cardNo:      bosGroup.cardNo,
        product,
        source:      easyTx.source || '',
        bosAmount:   bosGroup.totalAmount,
        easyAmount:  easyTx.amount,
        diff:        bosGroup.totalAmount - easyTx.amount,
      });
    }
    // 합계 일치 시 → 정상 (에러 없음)
  }

  // 이지샵에만 있는 것 체크
  for (const [no, easyTx] of easyMap) {
    if (!bosMap.has(no)) {
      errors.push({
        type:        'easy_only',
        approvalNo:  no,
        cardCompany: easyTx.cardCompany,
        cardNo:      easyTx.cardNo,
        product:     easyTx.fuel,
        transTime:   easyTx.transTime || '',
        source:      easyTx.source || '',
        bosAmount:   null,
        easyAmount:  easyTx.amount,
        diff:        -easyTx.amount,
      });
    }
  }

  // 승인번호 오타 재확인: BOS에만/카드에만 남은 건 중 금액이 같고 승인번호가 한 자리만
  // 다른 쌍(예: 284997489 ↔ 28497489, 14939188 ↔ 04939188)은 같은 거래로 보고 오류에서 제외
  const notes  = [];
  const paired = new Set();
  for (const b of errors.filter(e => e.type === 'bos_only')) {
    const c = errors.find(e => e.type === 'easy_only' && !paired.has(e) &&
      e.easyAmount === b.bosAmount && editDistance(e.approvalNo, b.approvalNo) <= 1);
    if (!c) continue;
    paired.add(b).add(c);
    notes.push({
      type: 'approval_diff', approvalNo: b.approvalNo, cardApprovalNo: c.approvalNo,
      cardCompany: c.cardCompany, cardNo: c.cardNo, product: b.product,
      source: c.source, amount: b.bosAmount,
    });
  }
  const remainErrors = errors.filter(e => !paired.has(e));

  annotateRecheck(remainErrors, ctx);

  // 합계: 이지샵에 없는 외상 거래는 bosTotal에서 제외 (별도 단말기 처리)
  const bosTotal = bosCards.reduce((s, t) => {
    const payType = t.bosPayType || '신용카드';
    if (payType !== '외상') return s + t.amount;
    return easyMap.has(t.approvalNo) ? s + t.amount : s;
  }, 0);
  const easyTotal = easyCards.reduce((s, t) => s + t.amount, 0);

  // 카드 출처(이지샵/나이스)별 합계 — 출처 없는 예전 데이터는 집계 안 함
  const bySource = {};
  for (const t of easyCards) {
    if (t.source) bySource[t.source] = (bySource[t.source] || 0) + t.amount;
  }

  return {
    bosTotal,
    easyTotal,
    bySource,
    totalDiff:  bosTotal - easyTotal,
    totalMatch: bosTotal === easyTotal && remainErrors.length === 0,
    errors:     remainErrors,
    notes,
    sources:    ctx.uploadedSources || [],
    hasError:   remainErrors.length > 0 || bosTotal !== easyTotal,
  };
}

// 승인번호 비교용 편집거리 (8~9자리라 단순 DP로 충분)
function editDistance(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b || Math.abs(a.length - b.length) > 1) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/**
 * 남은 오류마다 "이지샵·나이스 둘 다 정말 없는지" 재확인 결과를 붙인다.
 * 세차·유외상품도 나이스로 결제될 수 있으므로 상품 종류와 무관하게 두 출처 모두 확인한 결과다.
 * ctx.uploadedSources: 그날 업로드된 카드 출처 라벨 (['이지샵','나이스'])
 * ctx.expectedSources: 그날 있어야 하는 출처 (빠진 것은 notUploaded로 표시)
 * ctx.neighbors:       앞뒤 날짜 [{ date, bosCards, cardTxs }] — 날짜가 어긋나 들어간 건 탐색
 *
 * e.recheck = { checkedSources, notUploaded, crossDay }
 *   bos_only  → 같은 승인번호가 다른 날 카드내역에 있으면 crossDay
 *               (그날 BOS에도 있으면 inBos=true → BOS 중복 입력)
 *   easy_only → 같은 승인번호가 다른 날 BOS에 있으면 crossDay (BOS 날짜 차이)
 */
function annotateRecheck(errors, ctx) {
  const uploaded    = ctx.uploadedSources || [];
  const neighbors   = ctx.neighbors || [];
  const notUploaded = uploaded.length ? (ctx.expectedSources || []).filter(s => !uploaded.includes(s)) : [];
  for (const e of errors) {
    const recheck = { checkedSources: uploaded, notUploaded, crossDay: null };
    if (e.type === 'bos_only') {
      for (const n of neighbors) {
        const hit = (n.cardTxs || []).find(t => t.approvalNo === e.approvalNo);
        if (!hit) continue;
        recheck.crossDay = {
          date: n.date, source: hit.source || '', amount: hit.amount,
          inBos: (n.bosCards || []).some(t => t.approvalNo === e.approvalNo),
        };
        break;
      }
    } else if (e.type === 'easy_only') {
      for (const n of neighbors) {
        const hit = (n.bosCards || []).filter(t => t.approvalNo === e.approvalNo);
        if (!hit.length) continue;
        recheck.crossDay = {
          date: n.date, amount: hit.reduce((s, t) => s + t.amount, 0),
          inCard: (n.cardTxs || []).some(t => t.approvalNo === e.approvalNo),
        };
        break;
      }
    }
    e.recheck = recheck;
  }
}

module.exports = { matchCards };
