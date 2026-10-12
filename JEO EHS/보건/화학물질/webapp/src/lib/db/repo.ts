import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import {
  employees,
  mixtureIngredients,
  mixtures,
  referenceSubstances,
  type CategoryVerdict,
  type MatchStatus,
  type MaterialType,
} from "./schema";
import { parsePercent } from "@/lib/parsing/percent";
import { determineIngredientVerdict, determineOverallVerdict, normalizeCas } from "@/lib/match/verdict";
import { INDUSTRIAL_SAFETY_ACT_CATEGORY_KEYS } from "@/lib/law/categories";
import { computeReviewStatus, isManuallyChecked } from "@/lib/msds/reviewStatus";
import { COMMON_DEPARTMENT, PROCESS_COMMON_DEPARTMENT, PROCESS_COMMON_POSITION } from "@/lib/constants";

export type DraftIngredientInput = {
  ingredientName: string;
  casNo: string | null;
  contentPercentRaw: string | null;
};

// 원재료는 특정 공정에 종속되지 않고 회사 전체에서 공통으로 쓰인다고 보아, 부서를 항상
// COMMON_DEPARTMENT로 고정한다(업로드/검토 화면에서 부서 선택 UI를 아예 숨기고 이 값을 보냄 +
// 여기서도 방어적으로 한 번 더 강제한다). 대시보드에서도 원재료는 단일 박스로 묶인다.

export async function getReferencesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(referenceSubstances).where(inArray(referenceSubstances.id, ids));
}

export async function listMixtures() {
  return db.select().from(mixtures).orderBy(desc(mixtures.uploadedAt));
}

export async function deleteMixture(id: string) {
  await db.delete(mixtures).where(eq(mixtures.id, id));
}

/** 목록 화면에서 "어떤 성분이 유해화학물질에 해당하는지"를 바로 보여주기 위한 조회. */
export async function getHazardousIngredientNamesByMixture(
  mixtureIds: string[]
): Promise<Map<string, string[]>> {
  if (mixtureIds.length === 0) return new Map();
  const rows = await db
    .select({ mixtureId: mixtureIngredients.mixtureId, ingredientName: mixtureIngredients.ingredientName })
    .from(mixtureIngredients)
    .where(
      and(
        inArray(mixtureIngredients.mixtureId, mixtureIds),
        eq(mixtureIngredients.matchStatus, "matched_hazardous")
      )
    );
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.mixtureId) ?? [];
    arr.push(r.ingredientName);
    map.set(r.mixtureId, arr);
  }
  return map;
}

export async function getMixtureWithIngredients(id: string) {
  const [mixture] = await db.select().from(mixtures).where(eq(mixtures.id, id));
  if (!mixture) return null;
  const ingredients = await db
    .select()
    .from(mixtureIngredients)
    .where(eq(mixtureIngredients.mixtureId, id))
    .orderBy(mixtureIngredients.rowOrder);
  return { mixture, ingredients };
}

function toIngredientRows(mixtureId: string, rows: DraftIngredientInput[]) {
  return rows.map((r, idx) => {
    const percent = parsePercent(r.contentPercentRaw);
    return {
      mixtureId,
      rowOrder: idx,
      ingredientName: r.ingredientName,
      casNo: r.casNo,
      contentPercentRaw: r.contentPercentRaw,
      contentPercentMin: percent.min,
      contentPercentMax: percent.max,
      matchStatus: "no_cas" as MatchStatus, // 실제 매칭은 confirm 시점에 수행
    };
  });
}

export async function createDraftMixture(input: {
  productName: string;
  manufacturer: string | null;
  materialType: MaterialType;
  department?: string | null;
  workProcess?: string | null;
  revisionDate?: string | null;
  reviewCycleYears?: number | null;
  ppeText?: string | null;
  pdfBlobUrl: string;
  pdfFilename: string;
  draftIngredients: DraftIngredientInput[];
}) {
  const isRaw = input.materialType === "raw";
  const [mixture] = await db
    .insert(mixtures)
    .values({
      productName: input.productName,
      manufacturer: input.manufacturer,
      materialType: input.materialType,
      department: isRaw ? COMMON_DEPARTMENT : (input.department ?? null),
      workProcess: isRaw ? null : (input.workProcess ?? null),
      revisionDate: input.revisionDate ?? null,
      reviewCycleYears: input.reviewCycleYears ?? null,
      ppeText: input.ppeText ?? null,
      pdfBlobUrl: input.pdfBlobUrl,
      pdfFilename: input.pdfFilename,
      status: "pending_review",
    })
    .returning();

  if (input.draftIngredients.length > 0) {
    await db.insert(mixtureIngredients).values(toIngredientRows(mixture.id, input.draftIngredients));
  }

  return mixture;
}

export async function replaceIngredients(
  mixtureId: string,
  rows: DraftIngredientInput[],
  meta?: {
    productName?: string;
    manufacturer?: string | null;
    materialType?: MaterialType;
    department?: string | null;
    workProcess?: string | null;
    revisionDate?: string | null;
    reviewCycleYears?: number | null;
    ppeText?: string | null;
  }
) {
  await db.delete(mixtureIngredients).where(eq(mixtureIngredients.mixtureId, mixtureId));
  if (rows.length > 0) {
    await db.insert(mixtureIngredients).values(toIngredientRows(mixtureId, rows));
  }

  const isRaw = meta?.materialType === "raw";

  const patch: Partial<typeof mixtures.$inferInsert> = {};
  if (meta?.productName !== undefined && meta.productName.trim() !== "") patch.productName = meta.productName;
  if (meta?.manufacturer !== undefined) patch.manufacturer = meta.manufacturer;
  if (meta?.materialType !== undefined) patch.materialType = meta.materialType;
  if (meta?.department !== undefined) patch.department = isRaw ? COMMON_DEPARTMENT : meta.department;
  if (meta?.workProcess !== undefined) patch.workProcess = isRaw ? null : meta.workProcess;
  if (meta?.revisionDate !== undefined) patch.revisionDate = meta.revisionDate;
  if (meta?.reviewCycleYears !== undefined) patch.reviewCycleYears = meta.reviewCycleYears;
  if (meta?.ppeText !== undefined) patch.ppeText = meta.ppeText;
  if (Object.keys(patch).length > 0) {
    await db.update(mixtures).set(patch).where(eq(mixtures.id, mixtureId));
  }
}

/** 개정확인 수동 처리 — checked=true면 현재 개정일에 대해 "변경사항 없음"으로 저장, false면 해제. */
export async function setRevisionChecked(mixtureId: string, checked: boolean): Promise<boolean> {
  const [m] = await db.select({ revisionDate: mixtures.revisionDate }).from(mixtures).where(eq(mixtures.id, mixtureId));
  if (!m) return false;
  if (checked && !m.revisionDate) return false; // 개정일이 없으면 확인 대상이 아님
  await db
    .update(mixtures)
    .set(
      checked
        ? { revisionCheckedFor: m.revisionDate, revisionCheckedAt: new Date() }
        : { revisionCheckedFor: null, revisionCheckedAt: null }
    )
    .where(eq(mixtures.id, mixtureId));
  return true;
}

/** 사원명부(employees) 기반 부서/포지션 드롭다운 옵션 — 부서별로 소속 포지션 라벨을 묶어서 반환. */
export async function getDepartmentPositionOptions(): Promise<{
  departments: string[];
  positionsByDepartment: Record<string, string[]>;
}> {
  const rows = await db
    .selectDistinct({ department: employees.department, positionLabel: employees.positionLabel })
    .from(employees);
  const positionsByDepartment: Record<string, Set<string>> = {};
  for (const r of rows) {
    if (!r.department) continue;
    if (!positionsByDepartment[r.department]) positionsByDepartment[r.department] = new Set();
    if (r.positionLabel) positionsByDepartment[r.department].add(r.positionLabel);
  }
  const rosterDepartments = Object.keys(positionsByDepartment).sort((a, b) => a.localeCompare(b, "ko"));
  const result: Record<string, string[]> = {};
  for (const d of rosterDepartments) {
    result[d] = Array.from(positionsByDepartment[d]).sort((a, b) => a.localeCompare(b, "ko"));
  }

  // 사원명부에는 없는 합성 부서 — 특정 공정 하나에 매이지 않고 여러 공정에서 공통으로 쓰는 부자재용.
  result[PROCESS_COMMON_DEPARTMENT] = [PROCESS_COMMON_POSITION];
  const departments = [PROCESS_COMMON_DEPARTMENT, ...rosterDepartments];

  return { departments, positionsByDepartment: result };
}

export async function getEmployeeCount(): Promise<number> {
  const rows = await db.select({ id: employees.id }).from(employees);
  return rows.length;
}

export type DepartmentSummary = { department: string; positions: { label: string; count: number }[]; total: number };

/** 부서별·포지션별 인원수 요약(임직원 명부 관리 화면용). */
export async function getEmployeeSummaryByDepartment(): Promise<DepartmentSummary[]> {
  const rows = await db.select().from(employees);
  const byDept = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!byDept.has(r.department)) byDept.set(r.department, new Map());
    const posMap = byDept.get(r.department)!;
    const label = r.positionLabel ?? "(미지정)";
    posMap.set(label, (posMap.get(label) ?? 0) + 1);
  }
  return Array.from(byDept.entries())
    .map(([department, posMap]) => ({
      department,
      positions: Array.from(posMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
      total: Array.from(posMap.values()).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => a.department.localeCompare(b.department, "ko"));
}

/** 확정된 MSDS 중 해당 부서(+공정) 범위에 속하는 것만. 원재료(공통)는 department가 COMMON_DEPARTMENT일 때 materialType로 필터한다. */
export async function getMixturesForScope(department: string, workProcess: string | null) {
  if (department === COMMON_DEPARTMENT) {
    return db
      .select()
      .from(mixtures)
      .where(and(eq(mixtures.status, "confirmed"), eq(mixtures.materialType, "raw")))
      .orderBy(mixtures.productName);
  }
  const conditions = [eq(mixtures.status, "confirmed"), eq(mixtures.department, department)];
  if (workProcess) conditions.push(eq(mixtures.workProcess, workProcess));
  return db
    .select()
    .from(mixtures)
    .where(and(...conditions))
    .orderBy(mixtures.productName);
}

/** 부서+포지션(공정) 소속 직원 전원. department가 COMMON_DEPARTMENT("공통")면 전사 직원 전원을 반환한다. */
export async function getEmployeesForScope(
  department: string,
  workProcess: string | null
): Promise<(typeof employees.$inferSelect)[]> {
  // "공통"(원재료)과 "공정공통"(여러 공정에 걸쳐 쓰는 부자재)은 둘 다 특정 부서 하나로 좁혀지지
  // 않으므로, 교육서명지 대상은 전사 직원 전원으로 본다.
  if (department === COMMON_DEPARTMENT || department === PROCESS_COMMON_DEPARTMENT) {
    return db.select().from(employees).orderBy(employees.department, employees.name);
  }
  const conditions = [eq(employees.department, department)];
  if (workProcess) conditions.push(eq(employees.positionLabel, workProcess));
  return db
    .select()
    .from(employees)
    .where(and(...conditions))
    .orderBy(employees.name);
}

/** 목록/대시보드에서 산안법 4개 카테고리 O/X를 바로 보여주기 위한 조회. */
export async function getCategoryFlagsByMixture(
  mixtureIds: string[]
): Promise<Map<string, Set<string>>> {
  if (mixtureIds.length === 0) return new Map();
  const rows = await db
    .select({ mixtureId: mixtureIngredients.mixtureId, categoryVerdicts: mixtureIngredients.categoryVerdicts })
    .from(mixtureIngredients)
    .where(inArray(mixtureIngredients.mixtureId, mixtureIds));
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = map.get(r.mixtureId) ?? new Set<string>();
    for (const v of r.categoryVerdicts) {
      if (v.matched) set.add(v.category);
    }
    map.set(r.mixtureId, set);
  }
  return map;
}

export type DashboardRow = {
  mixtureId: string;
  materialType: MaterialType;
  department: string;
  workProcess: string;
  productName: string;
  ingredientName: string;
  casNo: string | null;
  chemicalsActFlag: boolean;
  categoryFlags: Record<string, boolean>; // INDUSTRIAL_SAFETY_ACT_CATEGORY_KEYS 각각의 O/X
  reviewStatus: ReturnType<typeof computeReviewStatus>;
  manuallyChecked: boolean;
  ppeText: string | null;
};

/** 부서×공정×제품×물질×해당법령 요약 — 대시보드 화면과 엑셀 export가 이 함수 하나를 공유한다. */
export async function getDashboardData(): Promise<DashboardRow[]> {
  const confirmedMixtures = await db
    .select()
    .from(mixtures)
    .where(eq(mixtures.status, "confirmed"))
    .orderBy(mixtures.productName);
  if (confirmedMixtures.length === 0) return [];

  const ids = confirmedMixtures.map((m) => m.id);
  const ingredients = await db
    .select()
    .from(mixtureIngredients)
    .where(inArray(mixtureIngredients.mixtureId, ids));

  const ingredientsByMixture = new Map<string, typeof ingredients>();
  for (const ing of ingredients) {
    const arr = ingredientsByMixture.get(ing.mixtureId) ?? [];
    arr.push(ing);
    ingredientsByMixture.set(ing.mixtureId, arr);
  }

  const rows: DashboardRow[] = [];
  for (const m of confirmedMixtures) {
    const reviewStatus = computeReviewStatus(m.revisionDate, m.revisionCheckedFor);
    const mixtureIngredientsList = ingredientsByMixture.get(m.id) ?? [];
    for (const ing of mixtureIngredientsList) {
      const categoryFlags: Record<string, boolean> = {};
      for (const key of INDUSTRIAL_SAFETY_ACT_CATEGORY_KEYS) categoryFlags[key] = false;
      for (const v of ing.categoryVerdicts) {
        if (v.matched) categoryFlags[v.category] = true;
      }
      rows.push({
        mixtureId: m.id,
        materialType: m.materialType,
        department: m.department ?? "(미지정)",
        workProcess: m.materialType === "raw" ? "-" : (m.workProcess ?? "(미지정)"),
        productName: m.productName,
        ingredientName: ing.ingredientName,
        casNo: ing.casNo,
        chemicalsActFlag: ing.matchStatus === "matched_hazardous",
        categoryFlags,
        reviewStatus,
        manuallyChecked: isManuallyChecked(m.revisionDate, m.revisionCheckedFor),
        ppeText: m.ppeText,
      });
    }
  }
  return rows;
}

/** 검토 화면에서 확정된 성분 목록을 기준 데이터와 매칭해 최종 판정을 내리고 저장한다. */
export async function confirmMixture(mixtureId: string) {
  const result = await getMixtureWithIngredients(mixtureId);
  if (!result) throw new Error("존재하지 않는 혼합물입니다.");
  const { ingredients } = result;

  const casSet = Array.from(
    new Set(
      ingredients
        .map((i) => i.casNo)
        .filter((c): c is string => !!c && c.trim() !== "")
        .map(normalizeCas)
    )
  );
  const refs =
    casSet.length > 0
      ? await db.select().from(referenceSubstances).where(inArray(referenceSubstances.casNo, casSet))
      : [];
  const refMap = new Map(refs.map((r) => [r.casNo, r]));

  const verdictsForOverall: { status: MatchStatus; categoryVerdicts: CategoryVerdict[] }[] = [];
  for (const ing of ingredients) {
    const percent = parsePercent(ing.contentPercentRaw);
    const verdict = determineIngredientVerdict(
      { casNo: ing.casNo, comparePercent: percent.compare, compareExclusive: percent.compareExclusive },
      (cas) => {
        const ref = refMap.get(cas);
        if (!ref) return undefined;
        return { id: ref.id, sourceCategories: ref.sourceCategories, thresholds: ref.thresholds };
      }
    );
    verdictsForOverall.push({ status: verdict.status, categoryVerdicts: verdict.categoryVerdicts });
    await db
      .update(mixtureIngredients)
      .set({
        contentPercentMin: percent.min,
        contentPercentMax: percent.max,
        matchStatus: verdict.status,
        matchedReferenceId: verdict.matchedReferenceId,
        appliedThresholds: verdict.appliedThresholds,
        categoryVerdicts: verdict.categoryVerdicts,
      })
      .where(eq(mixtureIngredients.id, ing.id));
  }

  const overallVerdict = determineOverallVerdict(verdictsForOverall);
  await db
    .update(mixtures)
    .set({ status: "confirmed", overallVerdict, confirmedAt: new Date() })
    .where(eq(mixtures.id, mixtureId));

  return overallVerdict;
}
