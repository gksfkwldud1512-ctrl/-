import { EXECUTOR_LABEL, TRIGGER_LABEL } from "@/lib/agents";
import type { AgentStatus, Executor, StepStatus, Trigger } from "@/lib/types";

const EXEC_CLS: Record<Executor, string> = {
  ai: "bg-violet-400/15 text-violet-200 ring-violet-400/40",
  rule: "bg-sky-400/10 text-sky-200 ring-sky-400/30",
  human: "bg-amber-400/15 text-amber-200 ring-amber-400/40",
};

export function ExecutorBadge({ executor }: { executor: Executor }) {
  const e = EXECUTOR_LABEL[executor];
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ${EXEC_CLS[executor]}`}>{e.icon} {e.text}</span>;
}

export function TriggerBadge({ trigger }: { trigger: Trigger }) {
  const t = TRIGGER_LABEL[trigger];
  return <span className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-sky-200/80 ring-1 ring-white/10">{t.icon} {t.text}</span>;
}

/** 상태는 색만으로 구분하지 않도록 아이콘+글자를 함께 쓴다. */
export const AGENT_STATUS: Record<AgentStatus, { text: string; icon: string; dot: string; chip: string; border: string }> = {
  idle: { text: "대기", icon: "💤", dot: "bg-slate-400", chip: "bg-slate-400/15 text-slate-200 ring-slate-400/40", border: "border-cc-line" },
  running: { text: "작업중", icon: "⚡", dot: "bg-cc-cyan", chip: "bg-cyan-400/15 text-cyan-200 ring-cyan-400/50", border: "border-cc-cyan/70" },
  reviewing: { text: "검토중", icon: "🔎", dot: "bg-violet-400", chip: "bg-violet-400/15 text-violet-200 ring-violet-400/40", border: "border-violet-400/60" },
  awaiting_approval: { text: "승인 대기", icon: "🙋", dot: "bg-cc-orange", chip: "bg-orange-400/15 text-orange-200 ring-orange-400/50", border: "border-cc-orange/70" },
  completed: { text: "완료", icon: "✅", dot: "bg-cc-green", chip: "bg-emerald-400/15 text-emerald-200 ring-emerald-400/40", border: "border-cc-green/60" },
  failed: { text: "실패", icon: "⚠️", dot: "bg-cc-red", chip: "bg-red-500/15 text-red-200 ring-red-400/50", border: "border-cc-red/70" },
};

export function StatusChip({ status }: { status: AgentStatus }) {
  const m = AGENT_STATUS[status];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${m.chip}`}><span aria-hidden>{m.icon}</span>{m.text}</span>;
}

export function DemoBadge() {
  return <span className="inline-flex items-center rounded border border-amber-400/70 bg-amber-400/15 px-1.5 text-[10px] font-bold tracking-wider text-amber-200">DEMO</span>;
}

export const STEP_STATUS: Record<StepStatus, { text: string; cls: string }> = {
  pending: { text: "·", cls: "border-slate-500 text-slate-400" },
  running: { text: "…", cls: "border-cc-cyan text-cyan-200" },
  success: { text: "✔", cls: "border-cc-green text-emerald-300" },
  error: { text: "✖", cls: "border-cc-red text-red-300" },
  waiting: { text: "⏳", cls: "border-cc-orange text-orange-300" },
};
