import type { MonthlyPoint } from "./parseDetails";

// 용수관리 화면 전용 — breakdown.water(취수)/breakdown.waterDischarge(배출)의 세부 항목 이름을
// 일반용수/공업용수/하수처리장/폐수 4종으로 재분류한다. 정확한 원본 라벨을 실제 업로드 파일로
// 확인하기 전까지는 키워드 기반 최선 추정이며, 매칭 안 되는 항목은 버리지 않고 "기타"로 남겨
// 화면에 그대로 노출한다(조용히 0으로 채우지 않음 — 사용자가 보고 바로 교정 지시할 수 있게).
export type ConsumptionCategory = "general" | "industrial" | "other";
export type DischargeCategory = "sewage" | "effluent" | "other";

export const CONSUMPTION_LABEL: Record<ConsumptionCategory, string> = {
  general: "일반용수",
  industrial: "공업용수",
  other: "기타(미분류)",
};

export const DISCHARGE_LABEL: Record<DischargeCategory, string> = {
  sewage: "하수처리장",
  effluent: "폐수",
  other: "기타(미분류)",
};

// breakdown.water의 측정 항목명은 이미 parseDetails.ts의 MEASURE_NAME_KO로 번역되어
// "취수 - 생활용수"/"취수 - 공정용수" 형태이거나(사전에 없으면) 원문 영어 그대로다.
export function classifyConsumption(measureName: string): ConsumptionCategory {
  const s = measureName.toLowerCase();
  if (s.includes("생활") || s.includes("domestic")) return "general";
  if (s.includes("공정") || s.includes("process")) return "industrial";
  return "other";
}

// breakdown.waterDischarge는 아직 번역 사전이 없어 대부분 원문 영어 그대로 들어온다.
// 실제 DETAILS 파일 확인 결과(사용자 확인): "Domestic wastewater discharged" = 하수처리장,
// "Process waste water discharged" = 폐수. domestic/process 키워드로 우선 매칭하고,
// 혹시 다른 표현이 섞여 있어도 놓치지 않도록 sewage/effluent 계열 키워드도 보조로 둔다.
export function classifyDischarge(measureName: string): DischargeCategory {
  const s = measureName.toLowerCase();
  if (/(domestic|sewage|wwtp|treatment plant|treatment facility|하수)/.test(s)) return "sewage";
  if (/(process|effluent|waste ?water discharge|폐수)/.test(s)) return "effluent";
  return "other";
}

function mergePoints(pointsList: MonthlyPoint[][]): MonthlyPoint[] {
  const map = new Map<string, MonthlyPoint>();
  for (const points of pointsList) {
    for (const p of points) {
      const key = `${p.fiscalYear}|${p.month}`;
      const existing = map.get(key);
      if (existing) existing.value += p.value;
      else map.set(key, { ...p });
    }
  }
  return [...map.values()].sort((a, b) => a.calendarYear - b.calendarYear || a.monthNumber - b.monthNumber);
}

/** breakdown의 측정 항목들 중 classify(name)===category인 것만 합쳐서 하나의 월별 시계열로 반환. */
export function categoryPoints<C extends string>(
  breakdown: Record<string, MonthlyPoint[]>,
  classify: (name: string) => C,
  category: C
): MonthlyPoint[] {
  const matched: MonthlyPoint[][] = [];
  for (const [name, points] of Object.entries(breakdown)) {
    if (classify(name) === category) matched.push(points);
  }
  return mergePoints(matched);
}

/** classify 결과가 "other"인 원본 측정 항목명 목록(값이 있는 것만) — 미분류 항목을 화면에 투명하게 알리기 위함. */
export function unmatchedMeasureNames<C extends string>(
  breakdown: Record<string, MonthlyPoint[]>,
  classify: (name: string) => C,
  otherCategory: C
): string[] {
  return Object.entries(breakdown)
    .filter(([name, points]) => classify(name) === otherCategory && points.some((p) => p.value !== 0))
    .map(([name]) => name);
}
