"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApprovalView } from "@/lib/approval/views";
import type { AuditEntry } from "@/lib/approval/types";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { withBase } from "@/lib/base";
import type { AgentId, AgentState, Run } from "@/lib/types";
import { AgentDrawer } from "./AgentDrawer";
import { ApprovalCenter } from "./ApprovalCenter";
import { DemoBadge } from "./badges";
import { Monitor } from "./Monitor";
import { Overview } from "./Overview";
import { AdminPanel, AuditPanel, CostPanel, DataClassification, GovernanceBar, GovernanceWarning, PolicyShield, type AuditState, type Me } from "./panels";

type Tab = "overview" | "monitor" | "approval";

export function ControlCenter({ agentStates, runs }: { agentStates: AgentState[]; runs: Run[] }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [approvals, setApprovals] = useState<ApprovalView[] | null>(null);
  const [audit, setAudit] = useState<AuditState>("loading");
  const [loadError, setLoadError] = useState("");

  const toLogin = () => { window.location.href = withBase("/login"); };

  const refresh = useCallback(async () => {
    try {
      const [m, a, l] = await Promise.all([fetch(withBase("/api/auth/me")), fetch(withBase("/api/approvals")), fetch(withBase("/api/audit"))]);
      if (m.status === 401 || a.status === 401) return toLogin();
      setMe(((await m.json()) as { user: Me }).user);
      setApprovals(((await a.json()) as { approvals: ApprovalView[] }).approvals);
      if (l.status === 403) setAudit("forbidden");
      else if (l.ok) {
        const j = (await l.json()) as { entries: AuditEntry[]; total: number; chain: { ok: boolean } };
        setAudit({ entries: j.entries, total: j.total, chainOk: j.chain.ok });
      } else setAudit("error");
      setLoadError("");
    } catch {
      setLoadError("서버에 연결하지 못했습니다. 잠시 후 새로고침하세요.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 로드: 서버 상태를 가져와 화면 상태로 반영
    void refresh();
  }, [refresh]);

  async function logout() {
    await fetch(withBase("/api/auth/logout"), { method: "POST" }).catch(() => null);
    toLogin();
  }

  const pending = approvals?.filter((a) => a.status === "pending").length ?? 0;
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "🏢 AI 사무실" },
    { id: "monitor", label: "📈 Workflow Monitor" },
    { id: "approval", label: `✅ Approval Center${pending ? ` (${pending})` : ""}` },
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-4">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 40 44" className="h-9 w-9 drop-shadow-[0_2px_6px_rgba(31,111,208,0.35)]" aria-hidden>
            <path d="M20 2 L37 11 V31 L20 42 L3 31 V11 Z" fill="#1f6fd0" stroke="#0b8fc4" strokeWidth="2" />
            <path d="M20 12 L29 17 V27 L20 32 L11 27 V17 Z" fill="#ffffff" />
          </svg>
          <div>
            <h1 className="text-xl font-bold leading-tight text-white">JEO EHS</h1>
            <p className="text-xs text-sky-200/80">AI Agent Control Center</p>
          </div>
        </div>
        <div className="ml-2 flex items-center gap-2"><DemoBadge /><span className="hidden text-xs text-amber-200/90 sm:inline">에이전트 상태·실행 기록은 샘플 / 승인·감사는 서버 메모리 데모</span></div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {me && <span className="rounded-full border border-cc-line bg-cc-panel px-3 py-1 text-sky-100"><span aria-hidden>👤</span> {me.name}{me.name !== ROLE_LABEL[me.role] && ` · ${ROLE_LABEL[me.role]}`}</span>}
          <button onClick={logout} className="rounded-lg border border-cc-line px-3 py-1 text-sky-200 hover:bg-white/10">로그아웃</button>
        </div>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-cc-line/70" aria-label="화면 선택">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-cc-cyan text-cyan-100" : "border-transparent text-sky-200/70 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {loadError && <p role="alert" className="mb-3 rounded border border-red-400/40 bg-red-900/30 px-3 py-2 text-sm text-red-200">{loadError}</p>}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="order-2 space-y-4 xl:order-1">
          {me ? <AdminPanel me={me} /> : <div className="h-32 animate-pulse rounded-xl bg-cc-panel/70" />}
          <PolicyShield />
          <DataClassification approvals={approvals} />
        </aside>

        <main className="order-1 min-w-0 xl:order-2">
          {tab === "overview" && <Overview states={agentStates} selected={selected} onSelect={setSelected} />}
          {tab === "monitor" && <Monitor runs={runs} />}
          {tab === "approval" && me && <ApprovalCenter approvals={approvals} me={me} onChanged={refresh} />}
        </main>

        <aside className="order-3 space-y-4">
          <AuditPanel audit={audit} />
          <CostPanel runs={runs} />
        </aside>
      </div>

      <div className="order-4 mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <GovernanceBar approvals={approvals} audit={audit} />
        <GovernanceWarning approvals={approvals} onOpen={() => setTab("approval")} />
      </div>

      {selected && <AgentDrawer id={selected} states={agentStates} runs={runs} onClose={() => setSelected(null)} />}
    </div>
  );
}
