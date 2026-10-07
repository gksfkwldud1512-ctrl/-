/**
 * 기준물질 카테고리(=reference_substances.sourceCategories 값) ↔ 소관 법령 매핑 레지스트리.
 *
 * 임계값(%)은 카테고리별로 코드에 고정하지 않는다 — 화관법 5종처럼 물질마다 기준이 다르거나
 * (예: 관리대상유해물질은 원칙 1%지만 특별관리물질로 지정된 일부 물질은 0.3%/0.1%로 낮아짐),
 * 반대로 작업환경측정/특수건강진단처럼 물질군 전체가 1%(허가대상유해물질 중 일부는 0.5%)인
 * 경우가 섞여 있어, 실제 값은 `data/reference/*.xlsx`의 '유해특성분류 및 혼합물 함량기준(%)'
 * 컬럼(thresholdRaw)에 "카테고리 : N% 이상" 형태로 그대로 담아 기존 threshold.ts 파서가
 * 다른 5종과 동일하게 처리하도록 한다. 이 레지스트리는 UI 라벨/소관법령 그룹핑 및
 * seedReferenceData.ts의 파일 목록 구성에만 쓰인다.
 */

export type LawAct = "화학물질관리법" | "산업안전보건법";

export type LawCategoryDef = {
  key: string; // reference_substances.sourceCategories 에 들어가는 문자열(=seed 파일의 category)
  label: string; // 화면 표시용 한글 라벨
  act: LawAct;
  sourceFile: string; // data/reference/ 아래 xlsx 파일명
};

export const LAW_CATEGORIES: LawCategoryDef[] = [
  // 기존 5종 — 화학물질관리법
  { key: "사고대비", label: "사고대비물질", act: "화학물질관리법", sourceFile: "사고대비물질.xlsx" },
  { key: "인체유해성", label: "인체등유해성물질", act: "화학물질관리법", sourceFile: "인체등유해성물질.xlsx" },
  { key: "잔류성오염", label: "잔류성오염물질", act: "화학물질관리법", sourceFile: "잔류성오염물질.xlsx" },
  { key: "제한금지허가", label: "제한금지허가물질", act: "화학물질관리법", sourceFile: "제한금지허가물질.xlsx" },
  { key: "중점관리", label: "중점관리물질", act: "화학물질관리법", sourceFile: "중점관리물질.xlsx" },
  // 신규 4종 — 산업안전보건법
  { key: "관리대상유해물질", label: "관리대상유해물질", act: "산업안전보건법", sourceFile: "관리대상유해물질.xlsx" },
  { key: "특별관리물질", label: "특별관리물질", act: "산업안전보건법", sourceFile: "특별관리물질.xlsx" },
  { key: "작업환경측정", label: "작업환경측정 대상 유해인자", act: "산업안전보건법", sourceFile: "작업환경측정대상유해인자.xlsx" },
  { key: "특수건강진단", label: "특수건강진단 대상 유해인자", act: "산업안전보건법", sourceFile: "특수건강진단대상유해인자.xlsx" },
];

export const CHEMICALS_ACT_CATEGORY_KEYS = LAW_CATEGORIES.filter(
  (c) => c.act === "화학물질관리법"
).map((c) => c.key);

export const INDUSTRIAL_SAFETY_ACT_CATEGORIES = LAW_CATEGORIES.filter(
  (c) => c.act === "산업안전보건법"
);

export const INDUSTRIAL_SAFETY_ACT_CATEGORY_KEYS = INDUSTRIAL_SAFETY_ACT_CATEGORIES.map(
  (c) => c.key
);

export function getCategoryDef(key: string): LawCategoryDef | undefined {
  return LAW_CATEGORIES.find((c) => c.key === key);
}

export function getCategoryLabel(key: string): string {
  return getCategoryDef(key)?.label ?? key;
}
