// 작업환경측정 예비조사 — DB/네트워크 접근이 없는 순수 로직(서버·클라이언트 양쪽에서 import 가능).
import { PROCESS_COMMON_DEPARTMENT } from "@/lib/constants";

export const MEASURE_KEY = "작업환경측정"; // reference_substances 카테고리 키(작업환경측정 대상 유해인자, 시행규칙 별표 21)
export const CONTROLLED_KEY = "관리대상유해물질";

/**
 * 측정 제외(임시작업·단시간작업) 판정 기준값.
 * ⚠ 2차 자료(측정기관 결과서 주석)에서 확인한 값이며 고용노동부 고시 원문 대조 전이다.
 *   원문을 확인하면 이 한 곳만 고치면 화면·엑셀에 모두 반영된다.
 */
export const EXCLUSION_CRITERIA = {
  tempMonthlyHoursLessThan: 24, // 임시작업: 월 24시간 미만
  tempRepeatMinMonthlyHours: 10, // 단, 월 10시간 이상이 매월 반복되면 임시작업 아님
  shortDailyHoursLessThan: 1, // 단시간작업: 관리대상 유해물질 1일 1시간 미만(매일 반복이면 제외)
  verified: false, // 법령 원문 대조 완료 여부
} as const;

export type Exclusion = {
  mixtureId: string;
  monthlyHours: number | null;
  dailyHours: number | null;
  repeatsMonthly: boolean; // 월 10시간 이상 작업이 매월 반복됨
  repeatsDaily: boolean; // 1일 1시간 미만 작업이 매일 반복됨
  reason: string;
  confirmedBy: string; // 확인한 담당자(비어 있으면 미확인)
  confirmedAt: string | null; // ISO
};

export type WorkEnvState = {
  updatedAt: string;
  nightWorkers: string[]; // employeeKey 목록
  exclusions: Record<string, Exclusion>; // mixtureId → 제외 확인
};

export const EMPTY_STATE: WorkEnvState = { updatedAt: "", nightWorkers: [], exclusions: {} };

export type EmployeeLite = { name: string; employeeNo: string | null; department: string; positionLabel: string | null };

export type RowLite = {
  mixtureId: string;
  materialType: string;
  department: string;
  workProcess: string;
  productName: string;
  ingredientName: string;
  casNo: string | null;
  categoryFlags: Record<string, boolean>;
};

/** 현장직 사번 접두 — 작업환경측정은 현장직만 대상이며 그 외(관리직)는 인원·야간근무자에서 모두 제외한다. */
export const FIELD_EMPLOYEE_PREFIXES = ["HSM", "HSX"] as const;

export function isFieldWorker(employeeNo: string | null): boolean {
  return !!employeeNo && FIELD_EMPLOYEE_PREFIXES.some((p) => employeeNo.toUpperCase().startsWith(p));
}

/** 사번이 있으면 사번, 없으면 이름|부서. 사원명부를 다시 올려도 야간 체크가 유지되게 하는 키. */
export function employeeKey(e: Pick<EmployeeLite, "name" | "employeeNo" | "department">): string {
  return e.employeeNo ? e.employeeNo : `${e.name}|${e.department}`;
}

export type ExclusionEval = { temporary: boolean; shortTime: boolean; candidate: boolean; reasons: string[] };

/** 입력한 사용시간이 제외 기준에 해당하는지(후보) 계산한다. 확정은 담당자 확인(confirmedBy)이 있어야 한다. */
export function evaluateExclusion(ex: Exclusion | undefined, controlled: boolean): ExclusionEval {
  const none: ExclusionEval = { temporary: false, shortTime: false, candidate: false, reasons: [] };
  if (!ex) return none;
  const c = EXCLUSION_CRITERIA;
  const reasons: string[] = [];
  const temporary =
    ex.monthlyHours != null &&
    ex.monthlyHours < c.tempMonthlyHoursLessThan &&
    !(ex.monthlyHours >= c.tempRepeatMinMonthlyHours && ex.repeatsMonthly);
  if (temporary) reasons.push(`임시작업(월 ${ex.monthlyHours}시간 < ${c.tempMonthlyHoursLessThan}시간)`);
  const shortTime =
    controlled && ex.dailyHours != null && ex.dailyHours < c.shortDailyHoursLessThan && !ex.repeatsDaily;
  if (shortTime) reasons.push(`단시간작업(1일 ${ex.dailyHours}시간 < ${c.shortDailyHoursLessThan}시간, 관리대상 유해물질)`);
  return { temporary, shortTime, candidate: temporary || shortTime, reasons };
}

export type ProductStatus = "not_target" | "target" | "exclude_candidate" | "excluded";

export type ProductInfo = {
  mixtureId: string;
  productName: string;
  materialType: string;
  controlled: boolean; // 성분 중 관리대상유해물질 해당
  measureIngredients: { name: string; casNo: string | null; controlled: boolean }[];
  status: ProductStatus;
  exclusion?: Exclusion;
  evalResult: ExclusionEval;
};

export type PersonInfo = { key: string; name: string; employeeNo: string | null; night: boolean };

export type ProcessVerdict = "target" | "exclude_candidate" | "excluded" | "none";

export type ProcessInfo = {
  department: string;
  process: string;
  people: PersonInfo[];
  headcount: number;
  nightCount: number;
  products: ProductInfo[];
  measureProductCount: number; // 제외 확정분을 뺀 측정 대상 제품 수
  measureIngredientNames: string[]; // 제외 확정분을 뺀 측정 대상 성분
  verdict: ProcessVerdict;
};

/** 부서·공정별 예비조사 현황. 부자재(auxiliary)만 대상으로 한다(원재료는 공통 취급이라 제외). */
export function buildProcesses(employees: EmployeeLite[], rows: RowLite[], state: WorkEnvState): ProcessInfo[] {
  const night = new Set(state.nightWorkers);
  const map = new Map<string, ProcessInfo>();
  const get = (department: string, process: string) => {
    const k = `${department}\u0000${process}`;
    let p = map.get(k);
    if (!p) {
      p = {
        department,
        process,
        people: [],
        headcount: 0,
        nightCount: 0,
        products: [],
        measureProductCount: 0,
        measureIngredientNames: [],
        verdict: "none",
      };
      map.set(k, p);
    }
    return p;
  };

  for (const e of employees) {
    if (!isFieldWorker(e.employeeNo)) continue; // 관리직 제외
    const p = get(e.department, e.positionLabel ?? "(미지정)");
    const key = employeeKey(e);
    p.people.push({ key, name: e.name, employeeNo: e.employeeNo, night: night.has(key) });
  }

  const byMixture = new Map<string, RowLite[]>();
  for (const r of rows) {
    if (r.materialType !== "auxiliary") continue;
    const arr = byMixture.get(r.mixtureId) ?? [];
    arr.push(r);
    byMixture.set(r.mixtureId, arr);
  }
  for (const list of byMixture.values()) {
    const first = list[0];
    const p = get(first.department, first.department === PROCESS_COMMON_DEPARTMENT ? "공통" : first.workProcess);
    const measureIngredients = list
      .filter((r) => r.categoryFlags[MEASURE_KEY])
      .map((r) => ({ name: r.ingredientName, casNo: r.casNo, controlled: !!r.categoryFlags[CONTROLLED_KEY] }));
    const controlled = list.some((r) => r.categoryFlags[CONTROLLED_KEY]);
    const exclusion = state.exclusions[first.mixtureId];
    const evalResult = evaluateExclusion(exclusion, controlled);
    let status: ProductStatus = "not_target";
    if (measureIngredients.length > 0) {
      if (evalResult.candidate) status = exclusion?.confirmedBy ? "excluded" : "exclude_candidate";
      else status = "target";
    }
    p.products.push({
      mixtureId: first.mixtureId,
      productName: first.productName,
      materialType: first.materialType,
      controlled,
      measureIngredients,
      status,
      exclusion,
      evalResult,
    });
  }

  const result = Array.from(map.values()).filter((p) => p.people.length > 0 || p.products.length > 0);
  for (const p of result) {
    p.people.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    p.products.sort((a, b) => a.productName.localeCompare(b.productName, "ko"));
    p.headcount = p.people.length;
    p.nightCount = p.people.filter((x) => x.night).length;
    const counted = p.products.filter((x) => x.status === "target" || x.status === "exclude_candidate");
    p.measureProductCount = counted.length;
    p.measureIngredientNames = Array.from(new Set(counted.flatMap((x) => x.measureIngredients.map((i) => i.name))));
    if (p.products.some((x) => x.status === "target")) p.verdict = "target";
    else if (p.products.some((x) => x.status === "exclude_candidate")) p.verdict = "exclude_candidate";
    else if (p.products.some((x) => x.status === "excluded")) p.verdict = "excluded";
    else p.verdict = "none";
  }
  return result.sort(
    (a, b) => a.department.localeCompare(b.department, "ko") || a.process.localeCompare(b.process, "ko")
  );
}

export const VERDICT_LABEL: Record<ProcessVerdict, string> = {
  target: "측정 대상",
  exclude_candidate: "제외 후보(확인 필요)",
  excluded: "제외 확정",
  none: "해당 없음",
};

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  not_target: "측정 대상 성분 없음",
  target: "측정 대상",
  exclude_candidate: "제외 후보(확인 필요)",
  excluded: "제외 확정",
};

/** 저장 요청 값 검증 — 잘못된 값은 null. */
export function cleanExclusion(raw: unknown): Exclusion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.mixtureId !== "string" || !o.mixtureId) return null;
  const hours = (v: unknown, max: number): number | null | undefined => {
    if (v === null || v === "" || v === undefined) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
    return n;
  };
  const monthlyHours = hours(o.monthlyHours, 744);
  const dailyHours = hours(o.dailyHours, 24);
  if (monthlyHours === undefined || dailyHours === undefined) return null;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    mixtureId: o.mixtureId,
    monthlyHours,
    dailyHours,
    repeatsMonthly: o.repeatsMonthly === true,
    repeatsDaily: o.repeatsDaily === true,
    reason: text(o.reason, 300),
    confirmedBy: text(o.confirmedBy, 40),
    confirmedAt: null, // 서버가 확인자가 있을 때 채운다
  };
}
