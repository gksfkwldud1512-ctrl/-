import { COMMON_DEPARTMENT, PROCESS_COMMON_DEPARTMENT } from "@/lib/constants";

type ScopedRow = { department: string; workProcess: string };

/**
 * 교육자료(서명지/교육물질 목록)의 대상 제품을 고른다.
 * - 원재료(공통): 원재료만
 * - 공정공통: 공정공통 제품만
 * - 그 외 부서·공정: 그 공정에서 사용하는 제품만(공정공통 제품은 섞지 않는다 — 공정공통 카드에서 따로 받는다)
 */
export function filterRowsForTraining<T extends ScopedRow>(rows: T[], department: string, workProcess: string | null): T[] {
  return rows.filter((r) => {
    if (department === COMMON_DEPARTMENT) return r.department === COMMON_DEPARTMENT;
    if (department === PROCESS_COMMON_DEPARTMENT) return r.department === PROCESS_COMMON_DEPARTMENT;
    return r.department === department && (!workProcess || r.workProcess === workProcess);
  });
}
