import type { AgentId, Executor } from "../types";
import type { Role } from "../auth/roles";

/** 법적 의무 판정·외부 제출은 "제한" 종류 — EHS 담당자만 결정/열람할 수 있다. */
export type ApprovalKind = "legal_determination" | "external_submission" | "internal_record";
export const RESTRICTED_KINDS: ApprovalKind[] = ["legal_determination", "external_submission"];
export const isRestricted = (k: ApprovalKind) => RESTRICTED_KINDS.includes(k);

export type ApprovalStatus = "pending" | "approved" | "rejected" | "review_requested";
export type DecisionAction = "approve" | "reject" | "request_review";

export type Decision = {
  action: DecisionAction;
  byId: string;
  byName: string;
  at: string; // ISO
  reason: string;
  evidenceVersion: string;
  approvalVersionBefore: number;
};

export type Approval = {
  id: string;
  title: string;
  kind: ApprovalKind;
  requestedBy: AgentId;
  executor: Executor;
  runId: string;
  qaPassed: boolean;
  qaNote: string;
  draft: string;
  evidence: string[];
  evidenceVersion: string; // 근거(원자료·초안)가 바뀔 때마다 올라간다
  artifactIds: string[];
  onApprove: string;
  status: ApprovalStatus;
  version: number; // 동시 수정 감지용(낙관적 잠금)
  decision?: Decision; // 가장 최근 결정
  history: Decision[];
  createdAt: string;
};

export type RunEvent = {
  eventId: string;
  runId: string;
  seq: number;
  type: "run.started" | "step.completed" | "verification.requested" | "run.completed" | "run.failed";
  actorType: "rule_engine" | "ai_agent" | "human" | "external_service";
  at: string;
};

export type Artifact = {
  id: string;
  runId: string;
  name: string;
  restricted: boolean;
  sha256: string; // 생성 시점의 내용 해시 — 열람·검증 때 다시 계산해 비교
  sizeBytes: number;
  content: string;
};

export type AuditOutcome = "allowed" | "denied" | "conflict" | "invalid";

export type AuditEntry = {
  seq: number;
  at: string;
  actorId: string;
  actorName: string;
  role: Role | "anonymous";
  action: string; // approve|reject|request_review|artifact.read|login|login_failed|...
  targetType: string;
  targetId: string;
  outcome: AuditOutcome;
  code?: string; // 거부/충돌 사유 코드
  reason?: string; // 결정 사유(사용자 입력, 500자 제한)
  evidenceVersion?: string;
  approvalVersion?: number;
  prevHash: string;
  hash: string;
};

export type Check = { id: string; label: string; ok: boolean; detail: string };
export type Verification = { ok: boolean; checks: Check[] };
