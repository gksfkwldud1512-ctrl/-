'use strict';

/**
 * BOS 카드 거래 vs 이지샵 카드 거래 승인번호 기준 매칭
 * bosCards:  [{ approvalNo, cardCompany, cardNo, amount, product }]
 * easyCards: [{ approvalNo, cardCompany, cardNo, amount, fuel }]
 */
function matchCards(bosCards, easyCards) {
  const bosMap  = new Map(bosCards.map(t  => [t.approvalNo,  t]));
  const easyMap = new Map(easyCards.map(t => [t.approvalNo,  t]));

  const errors = [];

  // BOS에 있는 것 기준 체크
  for (const [no, bosTx] of bosMap) {
    const easyTx = easyMap.get(no);
    if (!easyTx) {
      errors.push({
        type:        'bos_only',
        approvalNo:  no,
        cardCompany: bosTx.cardCompany,
        cardNo:      bosTx.cardNo,
        product:     bosTx.product,
        bosAmount:   bosTx.amount,
        easyAmount:  null,
        diff:        bosTx.amount,
      });
    } else if (bosTx.amount !== easyTx.amount) {
      errors.push({
        type:        'amount_mismatch',
        approvalNo:  no,
        cardCompany: bosTx.cardCompany,
        cardNo:      bosTx.cardNo,
        product:     bosTx.product,
        bosAmount:   bosTx.amount,
        easyAmount:  easyTx.amount,
        diff:        bosTx.amount - easyTx.amount,
      });
    }
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
        bosAmount:   null,
        easyAmount:  easyTx.amount,
        diff:        -easyTx.amount,
      });
    }
  }

  const bosTotal  = bosCards.reduce((s, t)  => s + t.amount, 0);
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
