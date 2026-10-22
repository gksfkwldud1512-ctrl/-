export type AgentId = "legal" | "safety" | "environment" | "report" | "action" | "qa";

/** 실행자 — 이 단계를 누가 수행하나. 비용이 드는 "ai"는 현재 단계에서 사용하지 않는다. */
export type Executor = "ai" | "rule" | "human";

/** 트리거 — 무엇이 이 단계를 시작시키나(예약은 실행자가 아니라 시작 조건). */
export type Trigger = "manual" | "schedule" | "event";

export type AgentStatus = "idle" | "running" | "reviewing" | "awaiting_approval" | "completed" | "failed";

export type AgentDef = {
  id: AgentId;
  name: string;
  role: string;
  executors: Executor[];
  trigger: Trigger;
};

export type AgentState = {
  id: AgentId;
  status: AgentStatus;
  headline: string; // 책상 카드에 보일 한 줄 요약
  task: string; // 상세 패널: 현재/직전 작업 설명
  updatedAt: string; // HH:mm
  nextRun: string; // 다음 실행 예정 설명
  outputs: string[]; // 최근 산출물
  error?: string; // failed일 때 원인
};

export type StepStatus = "pending" | "running" | "success" | "error" | "waiting";

export type WorkflowStep = {
  agent: AgentId;
  executor: Executor;
  status: StepStatus;
};

export type Run = {
  id: number;
  workflow: string;
  trigger: Trigger;
  startedAt: string; // HH:mm
  steps: WorkflowStep[];
  durationSec: number | null;
  error?: string;
};
