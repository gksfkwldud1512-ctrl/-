import type { AgentDef, AgentId, Executor, Trigger } from "./types";

export const AGENTS: AgentDef[] = [
  { id: "legal", name: "Legal", role: "법령 개정 검토 초안", executors: ["rule", "human"], trigger: "manual" },
  { id: "safety", name: "Safety", role: "중처법 이행·교육 기한 점검", executors: ["rule"], trigger: "schedule" },
  { id: "environment", name: "Environment", role: "폐수·대기 일지 누락 점검", executors: ["rule"], trigger: "schedule" },
  { id: "report", name: "Report", role: "주간회의 자료 초안", executors: ["rule"], trigger: "schedule" },
  { id: "action", name: "Action", role: "승인된 조치 실행(기록 저장)", executors: ["human", "rule"], trigger: "event" },
  { id: "qa", name: "QA", role: "산출물 근거·수치 검증", executors: ["rule"], trigger: "event" },
];

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentDef>;

export const EXECUTOR_LABEL: Record<Executor, { icon: string; text: string; cls: string }> = {
  ai: { icon: "🤖", text: "AI", cls: "bg-violet-100 text-violet-800" },
  rule: { icon: "⚙️", text: "규칙", cls: "bg-slate-200 text-slate-800" },
  human: { icon: "🙋", text: "승인", cls: "bg-amber-100 text-amber-900" },
};

export const TRIGGER_LABEL: Record<Trigger, { icon: string; text: string }> = {
  manual: { icon: "👆", text: "수동" },
  schedule: { icon: "⏰", text: "예약" },
  event: { icon: "⚡", text: "이벤트" },
};
