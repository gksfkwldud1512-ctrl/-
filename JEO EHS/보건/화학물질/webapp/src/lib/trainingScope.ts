import { COMMON_DEPARTMENT, PROCESS_COMMON_DEPARTMENT } from "@/lib/constants";

type ScopedRow = { department: string; workProcess: string };

/**
 * 교육자료(서명지/교육물질 목록)의 대상 제품을 고른다.
 * - 원재료(공통): 원재료만
 * - 공정공통: 공정공통 제품만
 * - 그 외 부서·공정: 그 공정 제품 + 공정공통 제품(공정공통은 모든 공정에서 사용하므로 전 공정 교육 대상)
 */
export function filterRowsForTraining<T extends ScopedRow>(rows: T[], department: string, workProcess: string | null): T[] {
  return rows.filter((r) => {
    if (department === COMMON_DEPARTMENT) return r.department === COMMON_DEPARTMENT;
    if (department === PROCESS_COMMON_DEPARTMENT) return r.department === PROCESS_COMMON_DEPARTMENT;
    if (r.department === PROCESS_COMMON_DEPARTMENT) return true;
    return r.department === department && (!workProcess || r.workProcess === workProcess);
  });
}
