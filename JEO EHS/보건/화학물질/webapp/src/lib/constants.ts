// DB 접근이 없는 순수 상수 — 서버/클라이언트 컴포넌트 양쪽에서 안전하게 import할 수 있다.

/** 원재료(materialType: "raw")는 항상 이 값으로 부서를 고정한다 — 회사 전체 공통 취급. */
export const COMMON_DEPARTMENT = "공통";

/**
 * 부자재 중 특정 공정 하나에 매이지 않고 여러 공정에서 공통으로 쓰는 경우 선택하는 부서.
 * 사원명부(employees)에는 없는 수동 추가 항목이라 getDepartmentPositionOptions()에서
 * 조회 결과에 합성해 끼워 넣는다 — 공정(포지션) 선택지는 "공통" 하나만 둔다.
 */
export const PROCESS_COMMON_DEPARTMENT = "공정공통";
export const PROCESS_COMMON_POSITION = "공통";
