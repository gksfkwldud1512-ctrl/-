/**
 * viewer      조회 전용
 * ehs_officer 승인된 EHS 담당자 — 승인·반려·재검토 요청 및 제한 결과물 열람
 * admin       관리자 — 감사로그·제한 결과물 열람은 가능하지만 승인 결정은 할 수 없다(업무 분리)
 */
export type Role = "viewer" | "ehs_officer" | "admin";

export type Permission = "approvals.read" | "approvals.decide" | "audit.read" | "artifact.read.restricted";

const GRANTS: Record<Permission, Role[]> = {
  "approvals.read": ["viewer", "ehs_officer", "admin"],
  "approvals.decide": ["ehs_officer"],
  "audit.read": ["ehs_officer", "admin"],
  "artifact.read.restricted": ["ehs_officer", "admin"],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[permission].includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  viewer: "조회",
  ehs_officer: "EHS 담당자",
  admin: "관리자",
};
