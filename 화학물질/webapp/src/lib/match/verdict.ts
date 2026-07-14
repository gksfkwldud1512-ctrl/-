import type { MatchStatus, OverallVerdict, ParsedThreshold } from "@/lib/db/schema";

export type ReferenceLookupResult = {
  id: string;
  thresholds: ParsedThreshold[];
};

export type IngredientVerdictInput = {
  casNo: string | null;
  comparePercent: number | null;
};

export type IngredientVerdict = {
  status: MatchStatus;
  matchedReferenceId: string | null;
  appliedThresholds: ParsedThreshold[];
};

export function normalizeCas(cas: string): string {
  return cas.trim().replace(/\s+/g, "");
}

/**
 * 성분 하나의 CAS번호/함유량을 기준 데이터와 비교해 최종 판정을 내린다.
 * - CAS 없음 -> no_cas
 * - CAS 불일치 -> no_match
 * - CAS 일치 + 기준함량 텍스트 공란(원문상 임계값 없음, 예: 잔류성오염물질 다수) -> 매칭만으로 해당
 * - CAS 일치 + 임계값 존재 -> 하나라도 초과/이상 조건을 만족하면 해당, 아니면 기준 미만
 */
export function determineIngredientVerdict(
  ingredient: IngredientVerdictInput,
  lookupByCas: (normalizedCas: string) => ReferenceLookupResult | undefined
): IngredientVerdict {
  if (!ingredient.casNo || ingredient.casNo.trim() === "") {
    return { status: "no_cas", matchedReferenceId: null, appliedThresholds: [] };
  }

  const ref = lookupByCas(normalizeCas(ingredient.casNo));
  if (!ref) {
    return { status: "no_match", matchedReferenceId: null, appliedThresholds: [] };
  }

  if (ref.thresholds.length === 0) {
    return { status: "matched_hazardous", matchedReferenceId: ref.id, appliedThresholds: [] };
  }

  const compare = ingredient.comparePercent;
  if (compare === null) {
    // 함유량 미기재/파싱불가 -> 초과여부 판단 불가, 리뷰 화면에서 보완 필요
    return { status: "matched_below_threshold", matchedReferenceId: ref.id, appliedThresholds: [] };
  }

  const exceeded = ref.thresholds.filter((t) =>
    t.operator === ">" ? compare > t.percent : compare >= t.percent
  );

  if (exceeded.length > 0) {
    return { status: "matched_hazardous", matchedReferenceId: ref.id, appliedThresholds: exceeded };
  }

  return { status: "matched_below_threshold", matchedReferenceId: ref.id, appliedThresholds: [] };
}

export function determineOverallVerdict(statuses: MatchStatus[]): OverallVerdict {
  return statuses.some((s) => s === "matched_hazardous") ? "hazardous" : "not_hazardous";
}
