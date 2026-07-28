import type { MonthlyPoint } from "./parseDetails";

/**
 * 강도(intensity) = 해당 월 사용량/배출량 ÷ 해당 월 매출액(MUSD).
 * 매출액이 없는 달은 계산할 수 없으므로 결과에서 제외한다.
 */
export function computeIntensity(numerator: MonthlyPoint[], salesUSD: MonthlyPoint[]): MonthlyPoint[] {
  const salesByKey = new Map(salesUSD.map((p) => [`${p.fiscalYear}|${p.month}`, p.value]));
  const result: MonthlyPoint[] = [];
  for (const p of numerator) {
    const sales = salesByKey.get(`${p.fiscalYear}|${p.month}`);
    if (!sales) continue;
    const salesMUSD = sales / 1_000_000;
    if (salesMUSD === 0) continue;
    result.push({ ...p, value: p.value / salesMUSD });
  }
  return result;
}
