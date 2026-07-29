import type { MonthlyPoint } from "./parseDetails";

function sortChrono(points: MonthlyPoint[]): MonthlyPoint[] {
  return [...points].sort((a, b) => a.calendarYear - b.calendarYear || a.monthNumber - b.monthNumber);
}

function ymKey(p: MonthlyPoint): number {
  return p.calendarYear * 12 + p.monthNumber;
}

/**
 * "12개월 누적" = 해당 월을 포함해 직전 12개월(달력 기준, 예: 5월이면 전년 6월~올해 5월)의 평균값
 * (합계가 아니라 평균). 12개월 중 데이터가 빠진 달이 하나라도 있으면 그 달은 계산하지 않는다 —
 * 실측 데이터에 결측월이 있을 때 "12개 데이터포인트"만 세서 합산하면 실제로는 12개월보다 더 넓은
 * 기간이 섞여 들어가 오차가 생기므로(예: Scope2), 반드시 달력상 연속된 12개월인지 확인한다.
 */
export function computeTTM(points: MonthlyPoint[]): MonthlyPoint[] {
  const sorted = sortChrono(points);
  const byYM = new Map(sorted.map((p) => [ymKey(p), p]));
  const result: MonthlyPoint[] = [];

  for (const p of sorted) {
    const endKey = ymKey(p);
    let sum = 0;
    let count = 0;
    for (let k = endKey - 11; k <= endKey; k++) {
      const pt = byYM.get(k);
      if (pt) {
        sum += pt.value;
        count++;
      }
    }
    if (count < 12) continue; // 달력상 12개월이 다 채워져야 신뢰할 수 있는 12개월 평균으로 인정
    result.push({ ...p, value: sum / 12 });
  }
  return result;
}

/**
 * 12개월 누적 강도 = 직전 12개월(달력 기준) 사용량 평균 ÷ 매출액 평균(MUSD).
 * (평균/평균 = 합계/합계 이므로 계산식 자체는 동일하지만, TTM과 같은 "달력상 12개월 검증" 규칙을 적용한다.)
 */
export function computeTTMIntensity(numerator: MonthlyPoint[], salesUSD: MonthlyPoint[]): MonthlyPoint[] {
  const numByYM = new Map(numerator.map((p) => [ymKey(p), p]));
  const salesByYM = new Map(salesUSD.map((p) => [ymKey(p), p]));
  const sorted = sortChrono(numerator);
  const result: MonthlyPoint[] = [];

  for (const p of sorted) {
    const endKey = ymKey(p);
    let numSum = 0;
    let salesSum = 0;
    let count = 0;
    for (let k = endKey - 11; k <= endKey; k++) {
      const np = numByYM.get(k);
      const sp = salesByYM.get(k);
      if (np && sp) {
        numSum += np.value;
        salesSum += sp.value;
        count++;
      }
    }
    if (count < 12) continue;
    const salesAvgMUSD = salesSum / 12 / 1_000_000;
    if (salesAvgMUSD === 0) continue;
    result.push({ ...p, value: numSum / 12 / salesAvgMUSD });
  }
  return result;
}
