import { can } from "../auth/roles";
import type { SessionUser } from "../auth/session";
import type { MemoryStore } from "../store/memory";
import { isRestricted, type Approval, type Artifact, type AuditOutcome, type Decision, type DecisionAction, type Verification } from "./types";
import { finalVerify } from "./verify";

export type DecideInput = {
  approvalId: string;
  action: unknown;
  reason: unknown;
  expectedVersion: unknown; // 화면이 본 approval.version
  evidenceVersion: unknown; // 화면이 본 근거 버전 — 그새 바뀌었으면 거부
  idempotencyKey: unknown; // 같은 클릭의 재전송을 하나로 합친다
  confirmLegal?: unknown; // 법적 판정/외부 제출 승인 시 명시적 확인
};

export type DecideResult =
  | { ok: true; approval: Approval; replay: boolean }
  | { ok: false; status: 400 | 403 | 404 | 409 | 422; code: string; message: string; verification?: Verification };

const ACTIONS: DecisionAction[] = ["approve", "reject", "request_review"];
const NEXT: Record<DecisionAction, Approval["status"]> = { approve: "approved", reject: "rejected", request_review: "review_requested" };
export const MIN_REASON = 5;
export const MAX_REASON = 500;

export function decide(store: MemoryStore, user: SessionUser, input: DecideInput, now = new Date()): DecideResult {
  const target = { targetType: "approval", targetId: String(input.approvalId) };
  const log = (action: string, outcome: AuditOutcome, extra: { code?: string; reason?: string; evidenceVersion?: string; approvalVersion?: number } = {}) =>
    store.appendAudit({ actorId: user.id, actorName: user.name, role: user.role, action, ...target, outcome, ...extra }, now);
  const fail = (status: 400 | 403 | 404 | 409 | 422, code: string, message: string, outcome: AuditOutcome, actionName: string, extra = {}, verification?: Verification): DecideResult => {
    log(actionName, outcome, { code, ...extra });
    return { ok: false, status, code, message, verification };
  };

  const action = ACTIONS.includes(input.action as DecisionAction) ? (input.action as DecisionAction) : null;
  const actionName = action ?? "decide";

  // 1) 권한 — 항상 서버에서 다시 확인한다(화면의 버튼 숨김은 보안이 아니다).
  if (!can(user.role, "approvals.decide")) return fail(403, "FORBIDDEN", "승인된 EHS 담당자만 결정할 수 있습니다.", "denied", actionName);

  // 2) 입력 검증
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
  if (!action) return fail(400, "INVALID_ACTION", "action은 approve/reject/request_review 중 하나여야 합니다.", "invalid", actionName);
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) return fail(400, "INVALID_REASON", `결정 사유는 ${MIN_REASON}~${MAX_REASON}자로 입력해야 합니다.`, "invalid", action);
  if (!/^[\w-]{8,100}$/.test(key)) return fail(400, "INVALID_IDEMPOTENCY_KEY", "요청 식별키(idempotencyKey)가 올바르지 않습니다.", "invalid", action);
  if (!Number.isInteger(input.expectedVersion)) return fail(400, "INVALID_VERSION", "expectedVersion이 필요합니다.", "invalid", action);
  if (typeof input.evidenceVersion !== "string" || !input.evidenceVersion) return fail(400, "INVALID_EVIDENCE_VERSION", "evidenceVersion이 필요합니다.", "invalid", action);

  const approval = store.getApproval(target.targetId);
  if (!approval) return fail(404, "NOT_FOUND", "승인 항목을 찾을 수 없습니다.", "invalid", action);

  // 3) 같은 요청의 재전송(네트워크 오류 후 재시도) → 이미 처리된 결과를 그대로 돌려준다. 새 기록은 만들지 않는다.
  const idemKey = `${user.id}:${approval.id}:${key}`;
  const prior = store.getIdempotent(idemKey);
  if (prior) return { ok: true, approval, replay: true };

  // 4) 이미 결정된 항목에 대한 중복 승인/반려
  if (approval.status !== "pending") {
    return fail(409, "ALREADY_DECIDED", `이미 처리된 항목입니다(${approval.status}). 새로고침하세요.`, "conflict", action, { evidenceVersion: String(input.evidenceVersion), approvalVersion: approval.version });
  }

  // 5) 동시 수정 / 근거 변경 감지
  if (approval.version !== input.expectedVersion) {
    return fail(409, "VERSION_CONFLICT", "다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 확인하세요.", "conflict", action, { approvalVersion: approval.version });
  }
  if (approval.evidenceVersion !== input.evidenceVersion) {
    return fail(409, "STALE_EVIDENCE", "확인하신 이후 근거가 변경되었습니다. 새 근거를 확인하세요.", "conflict", action, { evidenceVersion: String(input.evidenceVersion), approvalVersion: approval.version });
  }

  // 6) 승인에 대한 추가 조건 — 최종 검증 + (제한 종류는) 명시적 확인
  if (action === "approve") {
    if (isRestricted(approval.kind) && input.confirmLegal !== true) {
      return fail(400, "CONFIRMATION_REQUIRED", "법적 의무 판정·외부 제출은 확인 체크가 필요합니다.", "invalid", action, { evidenceVersion: approval.evidenceVersion, approvalVersion: approval.version });
    }
    const artifacts: Artifact[] = store.getArtifacts(approval.artifactIds);
    const verification = finalVerify(approval, store.eventsOf(approval.runId), artifacts);
    if (!verification.ok) {
      return fail(422, "VERIFICATION_FAILED", "최종 검증을 통과하지 못해 승인할 수 없습니다.", "denied", action, { evidenceVersion: approval.evidenceVersion, approvalVersion: approval.version }, verification);
    }
  }

  // 7) 반영(버전이 같을 때만) — 실패하면 그 사이 누군가 먼저 처리한 것
  const decision: Decision = {
    action, byId: user.id, byName: user.name, at: now.toISOString(), reason,
    evidenceVersion: approval.evidenceVersion, approvalVersionBefore: approval.version,
  };
  if (!store.compareAndSet(approval.id, approval.version, decision, NEXT[action], idemKey)) {
    const again = store.getIdempotent(idemKey);
    if (again) return { ok: true, approval: store.getApproval(approval.id)!, replay: true };
    return fail(409, "VERSION_CONFLICT", "동시에 다른 처리가 먼저 반영되었습니다.", "conflict", action, { approvalVersion: approval.version });
  }

  log(action, "allowed", { reason, evidenceVersion: approval.evidenceVersion, approvalVersion: approval.version });
  return { ok: true, approval: store.getApproval(approval.id)!, replay: false };
}
