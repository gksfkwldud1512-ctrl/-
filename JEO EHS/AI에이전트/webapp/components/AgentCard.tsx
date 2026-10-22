"use client";

import { AGENT_BY_ID } from "@/lib/agents";
import type { AgentId, AgentState } from "@/lib/types";
import { AGENT_STATUS, DemoBadge, ExecutorBadge, StatusChip, TriggerBadge } from "./badges";

export const AGENT_EMOJI: Record<AgentId, string> = { legal: "⚖️", safety: "🦺", environment: "🌱", report: "📝", action: "🛠️", qa: "🔍" };
const TINT: Record<AgentId, string> = {
  legal: "from-indigo-400/30", safety: "from-orange-400/30", environment: "from-emerald-400/30",
  report: "from-sky-400/30", action: "from-rose-400/30", qa: "from-teal-400/30",
};

/** 허브 둘레에 놓이는 담당자 카드(참고 이미지의 Outlook/Teams 카드 자리). */
export function AgentCard({
  state, selected, onSelect, compact = false,
}: { state: AgentState; selected: boolean; onSelect: () => void; compact?: boolean }) {
  const def = AGENT_BY_ID[state.id];
  const meta = AGENT_STATUS[state.status];
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${def.name} 담당자, 상태 ${meta.text}, DEMO 데이터. ${state.headline}`}
      className={`group h-full w-full rounded-xl border bg-cc-card/90 p-3 text-left shadow-[0_0_22px_rgba(40,140,228,0.12)] transition hover:bg-cc-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-cyan ${
        selected ? "border-cc-cyan ring-2 ring-cc-cyan/40" : meta.border
      } ${state.status === "running" ? "desk-running" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b ${TINT[state.id]} to-transparent text-2xl ring-1 ring-white/15`} aria-hidden>
          {AGENT_EMOJI[state.id]}
          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-cc-card ${meta.dot}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-white">{def.name}</span>
            <DemoBadge />
          </div>
          <div className="truncate text-[11px] text-sky-200/70">{def.role}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <StatusChip status={state.status} />
        {!compact && def.executors.map((e) => <ExecutorBadge key={e} executor={e} />)}
        {!compact && <TriggerBadge trigger={def.trigger} />}
      </div>
      <p className="mt-2 line-clamp-2 min-h-8 text-xs text-sky-100/85">{state.headline}</p>
    </button>
  );
}
