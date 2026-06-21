'use strict';

/**
 * BOS 카드 거래 vs 이지샵 카드 거래 승인번호 기준 매칭
 * bosCards:  [{ approvalNo, cardCompany, cardNo, amount, product }]
 * easyCards: [{ approvalNo, cardCompany, cardNo, amount, fuel, transTime }]
 *
 * [추가 처리] BOS에 같은 승인번호가 여러 건(예: 세차 15,000 + 3,000)인 경우
 *            금액을 합산하여 이지샵 단일 거래(18,000)와 비교 → 합계 일치 시 정상 처리
 */
function matchCards(bosCards, easyCards) {
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
        bosAmount:   null,
        easyAmount:  easyTx.amount,
        diff:        -easyTx.amount,
      });
    }
  }

  const bosTotal  = bosCards.reduce((s, t) => s + t.amount, 0);
  const easyTotal = easyCards.reduce((s, t) => s + t.amount, 0);

  return {
    bosTotal,
    easyTotal,
    totalDiff:  bosTotal - easyTotal,
    totalMatch: bosTotal === easyTotal && errors.length === 0,
    errors,
    hasError:   errors.length > 0 || bosTotal !== easyTotal,
  };
}

module.exports = { matchCards };
