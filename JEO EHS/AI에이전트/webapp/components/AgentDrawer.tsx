"use client";

import { useEffect } from "react";
import { AGENT_BY_ID } from "@/lib/agents";
import type { AgentId, AgentState, Run } from "@/lib/types";
import { AGENT_EMOJI } from "./AgentCard";
import { DemoBadge, ExecutorBadge, StatusChip, TriggerBadge } from "./badges";

/** 담당자 상세 패널 — 오른쪽에서 열리는 서랍. Esc로 닫는다. */
export function AgentDrawer({ id, states, runs, onClose }: { id: AgentId; states: AgentState[]; runs: Run[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const def = AGENT_BY_ID[id];
  const st = states.find((s) => s.id === id)!;
  const recent = runs.filter((r) => r.steps.some((s) => s.agent === id)).slice(0, 5);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        role="dialog" aria-modal="true" aria-label={`${def.name} 상세 정보`}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-sm overflow-y-auto border-l border-cc-line bg-cc-panel p-5 shadow-[-10px_0_40px_rgba(15,42,68,0.18)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-white"><span aria-hidden>{AGENT_EMOJI[id]}</span>{def.name} <DemoBadge /></h2>
            <p className="text-xs text-sky-300/80">{def.role}</p>
          </div>
          <button onClick={onClose} autoFocus aria-label="상세 패널 닫기" className="rounded px-2 py-1 text-sky-200 hover:bg-white/10">✕</button>
        </div>

        <div className="mt-3 flex items-center gap-2"><StatusChip status={st.status} /><span className="text-xs text-sky-300/70">갱신 {st.updatedAt}</span></div>

        {st.error && <p role="alert" className="mt-3 rounded border border-red-400/50 bg-red-900/30 px-3 py-2 text-sm text-red-200">실패 원인: {st.error}</p>}

        <dl className="mt-4 space-y-4 text-sm text-sky-50">
          <div><dt className="text-xs font-bold text-sky-300/80">현재/직전 작업</dt><dd className="mt-0.5">{st.task}</dd></div>
          <div>
            <dt className="text-xs font-bold text-sky-300/80">실행 방식</dt>
            <dd className="mt-1 flex flex-wrap gap-1">{def.executors.map((e) => <ExecutorBadge key={e} executor={e} />)}<TriggerBadge trigger={def.trigger} /></dd>
          </div>
          <div><dt className="text-xs font-bold text-sky-300/80">다음 실행</dt><dd className="mt-0.5">{st.nextRun}</dd></div>
          <div>
            <dt className="text-xs font-bold text-sky-300/80">최근 산출물</dt>
            <dd className="mt-0.5">{st.outputs.length === 0 ? <span className="text-sky-300/60">없음</span> : <ul className="list-disc pl-5">{st.outputs.map((o) => <li key={o}>{o}</li>)}</ul>}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-sky-300/80">최근 실행</dt>
            <dd className="mt-1">
              {recent.length === 0 ? <span className="text-sky-300/60">기록 없음</span> : (
                <ul className="space-y-1">
                  {recent.map((r) => (
                    <li key={r.id} className="rounded border border-white/10 bg-white/5 px-2 py-1">#{r.id} {r.workflow} <span className="text-xs text-sky-300/70">{r.startedAt} · {r.error ? "오류" : "정상"}</span></li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>

        <button disabled className="mt-5 w-full rounded-lg bg-white/10 py-2 text-sm text-sky-200/60" title="DEMO 화면에서는 실행할 수 없습니다">수동 실행 (DEMO — 비활성)</button>
      </aside>
    </div>
  );
}
