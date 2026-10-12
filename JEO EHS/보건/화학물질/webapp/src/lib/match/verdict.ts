import type { CategoryVerdict, MatchStatus, OverallVerdict, ParsedThreshold } from "@/lib/db/schema";
import { CHEMICALS_ACT_CATEGORY_KEYS, INDUSTRIAL_SAFETY_ACT_CATEGORY_KEYS } from "@/lib/law/categories";

export type ReferenceLookupResult = {
  id: string;
  sourceCategories: string[];
  thresholds: ParsedThreshold[];
};

export type IngredientVerdictInput = {
  casNo: string | null;
  comparePercent: number | null;
  /** true면 실제 함유량 < comparePercent (예: "< 5", "3 - < 5") */
  compareExclusive?: boolean;
};

export type IngredientVerdict = {
  status: MatchStatus;
  matchedReferenceId: string | null;
  appliedThresholds: ParsedThreshold[];
  categoryVerdicts: CategoryVerdict[];
};

export function normalizeCas(cas: string): string {
  return cas.trim().replace(/\s+/g, "");
}

function exceedsThreshold(compare: number, t: ParsedThreshold, exclusive = false): boolean {
  // 상한 미만("< 5")이면 기준이 5% 이상이어도 실제 값은 5에 못 미치므로 해당되지 않는다.
  if (exclusive) return compare > t.percent;
  return t.operator === ">" ? compare > t.percent : compare >= t.percent;
}

/** 산안법 4개 카테고리(관리대상유해물질/특별관리물질/작업환경측정/특수건강진단) 각각을 독립 판정한다. */
function determineCategoryVerdicts(
  ref: ReferenceLookupResult,
  comparePercent: number | null,
  compareExclusive = false
): CategoryVerdict[] {
  const verdicts: CategoryVerdict[] = [];
  for (const key of INDUSTRIAL_SAFETY_ACT_CATEGORY_KEYS) {
    if (!ref.sourceCategories.includes(key)) continue;
    const thresholdsForCategory = ref.thresholds.filter((t) => t.category === key);

    if (thresholdsForCategory.length === 0) {
      // 해당 카테고리에 %기준 텍스트가 없는 경우 — 매칭만으로 해당(방어적 기본값)
      verdicts.push({ category: key, matched: true, threshold: null });
      continue;
    }
    if (comparePercent === null) {
      // 함유량 미기재/파싱불가 — 초과여부 판단 불가로 보수적으로 미해당 처리(검토화면에서 보완 필요)
      verdicts.push({ category: key, matched: false, threshold: thresholdsForCategory[0] });
      continue;
    }
    const exceeded = thresholdsForCategory.filter((t) => exceedsThreshold(comparePercent, t, compareExclusive));
    verdicts.push({
      category: key,
      matched: exceeded.length > 0,
      threshold: exceeded[0] ?? thresholdsForCategory[0],
    });
  }
  return verdicts;
}

/**
 * 성분 하나의 CAS번호/함유량을 기준 데이터와 비교해 최종 판정을 내린다.
 *
 * matchStatus/appliedThresholds(기존 필드, 하위호환 유지)는 화학물질관리법 5종 기준만 집계한다:
 * - CAS 없음 -> no_cas
 * - CAS 불일치, 또는 CAS는 일치하나 화관법 5종 어디에도 속하지 않음(산안법 전용 매칭) -> no_match
 * - 화관법 소속 + 기준함량 텍스트 공란(원문상 임계값 없음, 예: 잔류성오염물질 다수) -> 매칭만으로 해당
 * - 화관법 소속 + 임계값 존재 -> 하나라도 초과/이상 조건을 만족하면 해당, 아니면 기준 미만
 *
 * categoryVerdicts(신규)는 산안법 4종을 각각 독립적으로 판정한 결과다.
 */
export function determineIngredientVerdict(
  ingredient: IngredientVerdictInput,
  lookupByCas: (normalizedCas: string) => ReferenceLookupResult | undefined
): IngredientVerdict {
  if (!ingredient.casNo || ingredient.casNo.trim() === "") {
    return { status: "no_cas", matchedReferenceId: null, appliedThresholds: [], categoryVerdicts: [] };
  }

  const ref = lookupByCas(normalizeCas(ingredient.casNo));
  if (!ref) {
    return { status: "no_match", matchedReferenceId: null, appliedThresholds: [], categoryVerdicts: [] };
  }

  const categoryVerdicts = determineCategoryVerdicts(ref, ingredient.comparePercent, ingredient.compareExclusive ?? false);

  const isChemicalsActMember = ref.sourceCategories.some((c) => CHEMICALS_ACT_CATEGORY_KEYS.includes(c));
  if (!isChemicalsActMember) {
    // 산안법 전용으로만 매칭된 물질 — 화관법 유해화학물질 요약 배지에는 "해당없음"으로 남긴다.
    return { status: "no_match", matchedReferenceId: ref.id, appliedThresholds: [], categoryVerdicts };
  }

  // 주의: ParsedThreshold.category는 화관법 5종 xlsx의 thresholdRaw 원문에서 그대로 파싱된
  // 텍스트("유독물질"/"제한물질"/"금지물질"/"사고대비물질" 등, 파일마다 제각각)라
  // CHEMICALS_ACT_CATEGORY_KEYS(우리가 seed 시 부여한 카테고리 키)와 직접 매치되지 않는다.
  // 반대로 산안법 4종은 우리가 직접 "카테고리 : N% 이상" 형태로 생성했으므로 category가
  // INDUSTRIAL_SAFETY_ACT_CATEGORY_KEYS와 정확히 일치한다 — 그래서 산안법 라벨을 제외한
  // 나머지 전부를 화관법 임계값으로 취급한다(기존 동작과 동일).
  const chemThresholds = ref.thresholds.filter((t) => !INDUSTRIAL_SAFETY_ACT_CATEGORY_KEYS.includes(t.category));

  if (chemThresholds.length === 0) {
    return {
      status: "matched_hazardous",
      matchedReferenceId: ref.id,
      appliedThresholds: [],
      categoryVerdicts,
    };
  }

  const compare = ingredient.comparePercent;
  if (compare === null) {
    // 함유량 미기재/파싱불가 -> 초과여부 판단 불가, 리뷰 화면에서 보완 필요
    return {
      status: "matched_below_threshold",
      matchedReferenceId: ref.id,
      appliedThresholds: [],
      categoryVerdicts,
    };
  }

  const exceeded = chemThresholds.filter((t) => exceedsThreshold(compare, t, ingredient.compareExclusive ?? false));

  if (exceeded.length > 0) {
    return {
      status: "matched_hazardous",
      matchedReferenceId: ref.id,
      appliedThresholds: exceeded,
      categoryVerdicts,
    };
  }

  return {
    status: "matched_below_threshold",
    matchedReferenceId: ref.id,
    appliedThresholds: [],
    categoryVerdicts,
  };
}

/** 화관법 요약(matchStatus) 또는 산안법 4종 중 하나라도 해당하면 전체 "해당"으로 판정한다. */
export function determineOverallVerdict(
  ingredients: { status: MatchStatus; categoryVerdicts: CategoryVerdict[] }[]
): OverallVerdict {
  const chemHazardous = ingredients.some((i) => i.status === "matched_hazardous");
  const industrialHazardous = ingredients.some((i) => i.categoryVerdicts.some((v) => v.matched));
  return chemHazardous || industrialHazardous ? "hazardous" : "not_hazardous";
}
