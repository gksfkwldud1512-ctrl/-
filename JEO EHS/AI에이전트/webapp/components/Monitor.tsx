"use client";

import { useState } from "react";
import { AGENT_BY_ID } from "@/lib/agents";
import type { Executor, Run } from "@/lib/types";
import { DemoBadge, ExecutorBadge, STEP_STATUS, TriggerBadge } from "./badges";
import { Panel } from "./ui";

type Filter = "all" | Executor | "schedule";

export function Monitor({ runs }: { runs: Run[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "전체" }, { id: "ai", label: "🤖 AI" }, { id: "rule", label: "⚙️ 규칙" },
    { id: "schedule", label: "⏰ 예약" }, { id: "human", label: "🙋 승인" },
  ];
  const shown = runs.filter((r) => (filter === "all" ? true : filter === "schedule" ? r.trigger === "schedule" : r.steps.some((s) => s.executor === filter)));

  return (
    <Panel title="Workflow Monitor" action={<DemoBadge />}>
      <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="실행 방식 필터">
        {filters.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
            className={`rounded-full border px-3 py-1 text-xs ${filter === f.id ? "border-cc-cyan bg-cc-cyan/15 text-cyan-100" : "border-cc-line text-sky-200/80 hover:bg-white/5"}`}>
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-sky-200/70">해당하는 실행이 없습니다.</p>}
      <ul className="space-y-3">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl border border-cc-line/70 bg-cc-card/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-white">#{r.id} {r.workflow}</span>
              <TriggerBadge trigger={r.trigger} />
              <span className="text-xs text-sky-300/70">{r.startedAt} · {r.durationSec === null ? "진행중/대기" : `${r.durationSec}초`}</span>
            </div>
            <ol className="mt-2 flex flex-wrap items-center gap-1">
              {r.steps.map((s, i) => {
                const st = STEP_STATUS[s.status];
                return (
                  <li key={i} className="flex items-center gap-1">
                    {i > 0 && <span aria-hidden className="text-cc-cyan/70">→</span>}
                    <span className={`flex items-center gap-1 rounded border bg-cc-bg/50 px-2 py-1 text-xs text-sky-50 ${st.cls}`}>
                      {AGENT_BY_ID[s.agent].name} <ExecutorBadge executor={s.executor} /> {st.text}
                    </span>
                  </li>
                );
              })}
            </ol>
            {r.error && <p className="mt-2 rounded border border-red-400/40 bg-red-900/30 px-2 py-1 text-xs text-red-200">오류: {r.error}</p>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
