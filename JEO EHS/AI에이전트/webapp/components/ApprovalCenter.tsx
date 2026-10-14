"use client";

import { useRef, useState } from "react";
import type { ApprovalView } from "@/lib/approval/views";
import type { DecisionAction } from "@/lib/approval/types";
import { AGENT_BY_ID } from "@/lib/agents";
import { withBase } from "@/lib/base";
import { ExecutorBadge } from "./badges";
import type { Me } from "./panels";
import { Panel } from "./ui";

const KIND: Record<string, { text: string; cls: string }> = {
  legal_determination: { text: "법적 의무 판정", cls: "bg-red-500/15 text-red-200 ring-red-400/50" },
  external_submission: { text: "외부 제출", cls: "bg-orange-400/15 text-orange-200 ring-orange-400/50" },
  internal_record: { text: "내부 기록", cls: "bg-sky-400/10 text-sky-200 ring-sky-400/30" },
};
const STATUS: Record<string, { text: string; cls: string }> = {
  pending: { text: "승인 대기", cls: "text-orange-300" }, approved: { text: "승인됨", cls: "text-emerald-300" },
  rejected: { text: "반려됨", cls: "text-red-300" }, review_requested: { text: "재검토 요청됨", cls: "text-violet-300" },
};
const ACTION_TEXT: Record<DecisionAction, string> = { approve: "승인", reject: "반려", request_review: "재검토 요청" };
const when = (iso: string) => new Date(iso).toLocaleString("ko-KR", { hour12: false });

export function ApprovalCenter({ approvals, me, onChanged }: { approvals: ApprovalView[] | null; me: Me; onChanged: () => Promise<void> }) {
  if (!approvals) return <Panel title="Approval Center"><p className="text-sm text-sky-200/70">불러오는 중...</p></Panel>;
  const pending = approvals.filter((a) => a.status === "pending");
  const rest = approvals.filter((a) => a.status !== "pending");
  const count = (s: string) => approvals.filter((a) => a.status === s).length;

  return (
    <div className="space-y-4">
      <Panel title="Approval Center">
        <p className="text-sm text-sky-100/90">
          대기 {count("pending")} · 승인 {count("approved")} · 반려 {count("rejected")} · 재검토 {count("review_requested")}
        </p>
        <p className="mt-1 text-xs text-sky-300/70">
          법적 의무 판정·외부 제출은 <b className="text-sky-100">승인된 EHS 담당자</b>의 확인이 있어야 확정됩니다. 현재 로그인: {me.name}
          {me.role !== "ehs_officer" && " (결정 권한 없음 — 조회만 가능)"}
        </p>
      </Panel>
      {pending.length === 0 && <p className="text-sm text-sky-200/70">승인 대기 중인 항목이 없습니다.</p>}
      <ul className="space-y-4">{pending.map((a) => <Card key={a.id} a={a} onChanged={onChanged} />)}</ul>
      {rest.length > 0 && (
        <Panel title="처리된 항목">
          <ul className="space-y-2">
            {rest.map((a) => (
              <li key={a.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{a.title}</span>
                  <span className={`text-xs font-bold ${STATUS[a.status].cls}`}>{STATUS[a.status].text}</span>
                </div>
                {a.decision && (
                  <p className="mt-0.5 text-xs text-sky-300/80">
                    {a.decision.byName} · {ACTION_TEXT[a.decision.action]} · {when(a.decision.at)} · 근거 {a.decision.evidenceVersion} · “{a.decision.reason}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Card({ a, onChanged }: { a: ApprovalView; onChanged: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [opened, setOpened] = useState<Record<string, string>>({});
  // 같은 클릭의 재전송이 중복 처리되지 않도록, 성공할 때까지 같은 요청키를 쓴다(네트워크 오류 대비).
  const keyRef = useRef<{ action: string; key: string } | null>(null);
  const restricted = a.kind !== "internal_record";

  async function submit(action: DecisionAction) {
    if (reason.trim().length < 5) return setMsg({ kind: "error", text: "결정 사유를 5자 이상 입력하세요." });
    if (action === "approve" && restricted && !confirm) return setMsg({ kind: "error", text: "법적 판정·외부 제출은 확인 체크가 필요합니다." });
    if (!keyRef.current || keyRef.current.action !== action) keyRef.current = { action, key: crypto.randomUUID() };
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(withBase(`/api/approvals/${a.id}/decision`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, expectedVersion: a.version, evidenceVersion: a.evidenceVersion, idempotencyKey: keyRef.current.key, confirmLegal: confirm }),
      });
      const j = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (res.ok) { keyRef.current = null; await onChanged(); return; }
      if (res.status === 409) { keyRef.current = null; setMsg({ kind: "error", text: `${j?.message ?? "충돌이 발생했습니다."} (목록을 새로 불러왔습니다)` }); await onChanged(); return; }
      setMsg({ kind: "error", text: j?.message ?? `처리하지 못했습니다 (${res.status})` });
    } catch {
      setMsg({ kind: "error", text: "네트워크 오류입니다. 같은 버튼을 다시 눌러도 중복 처리되지 않습니다." });
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    try {
      const res = await fetch(withBase(`/api/artifacts/${id}`));
      const j = (await res.json().catch(() => null)) as { content?: string; message?: string } | null;
      setOpened((o) => ({ ...o, [id]: res.ok ? (j?.content ?? "") : `⛔ ${j?.message ?? "열람할 수 없습니다."}` }));
    } catch {
      setOpened((o) => ({ ...o, [id]: "⛔ 네트워크 오류" }));
    }
  }

  const k = KIND[a.kind];
  return (
    <li className="rounded-xl border border-cc-line/80 bg-cc-panel/85 p-4 shadow-[0_0_24px_rgba(40,140,228,0.10)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ring-1 ${k.cls}`}>{k.text}</span>
        <ExecutorBadge executor={a.executor} />
        <h3 className="font-bold text-white">{a.title}</h3>
      </div>
      <p className="mt-1 text-xs text-sky-300/80">
        요청: {AGENT_BY_ID[a.requestedBy].name} · 근거 버전 {a.evidenceVersion} · 문서 v{a.version} · 실행 {a.runId}
      </p>

      {a.redacted ? (
        <p className="mt-3 rounded border border-white/10 bg-white/5 p-3 text-sm text-sky-200/80">🔒 법적 판정·외부 제출 내용은 EHS 담당자·관리자만 볼 수 있습니다.</p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <section><h4 className="text-xs font-bold text-sky-300/80">초안</h4><p className="mt-1 whitespace-pre-wrap rounded bg-cc-bg/60 p-2 text-sm text-sky-50">{a.draft}</p></section>
          <section><h4 className="text-xs font-bold text-sky-300/80">근거·원자료</h4><ul className="mt-1 list-disc pl-5 text-sm text-sky-50">{a.evidence?.map((e) => <li key={e}>{e}</li>)}</ul></section>
        </div>
      )}

      {a.verification && (
        <section className="mt-3" aria-label="최종 검증 결과">
          <h4 className="text-xs font-bold text-sky-300/80">최종 검증 (서버가 승인 직전에 다시 계산)</h4>
          <ul className="mt-1 space-y-1">
            {a.verification.checks.map((c) => (
              <li key={c.id} className={`flex gap-2 rounded px-2 py-1 text-sm ${c.ok ? "bg-cc-green/10 text-emerald-200" : "bg-cc-red/15 text-red-200"}`}>
                <span aria-hidden>{c.ok ? "✓" : "✕"}</span><span className="font-medium">{c.label}</span><span className="text-xs opacity-80">— {c.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.artifacts.length > 0 && (
        <section className="mt-3">
          <h4 className="text-xs font-bold text-sky-300/80">결과물</h4>
          <ul className="mt-1 space-y-1">
            {a.artifacts.map((f) => (
              <li key={f.id} className="text-sm text-sky-50">
                <span>{f.restricted ? "🔒" : "📄"} {f.name} <span className="text-xs text-sky-300/60">({f.sizeBytes}B · {f.sha256Short})</span></span>{" "}
                {f.canOpen ? <button onClick={() => open(f.id)} className="text-xs text-cc-cyan hover:underline">열람</button> : <span className="text-xs text-sky-300/60">열람 권한 없음</span>}
                {opened[f.id] && <pre className="mt-1 whitespace-pre-wrap rounded bg-cc-bg/70 p-2 text-xs text-sky-100">{opened[f.id]}</pre>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.onApprove && <p className="mt-3 rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-sm text-amber-100">승인하면: {a.onApprove}</p>}

      {a.canDecide ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-sky-300/80">
            결정 사유 (필수, 5자 이상 — 감사 로그에 기록됩니다)
            <textarea value={reason} onChange={(e) => { setReason(e.target.value); setMsg(null); }} rows={2} maxLength={500}
              className="mt-1 w-full rounded-lg border border-cc-line bg-cc-bg/70 px-2 py-1.5 text-sm text-white outline-none focus:border-cc-cyan" />
          </label>
          {restricted && (
            <label className="flex items-start gap-2 text-sm text-sky-100">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1" />
              근거와 결과물을 직접 확인했으며, 이 {k.text}에 대한 책임자로서 결정합니다.
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => submit("approve")} title={a.verification && !a.verification.ok ? "최종 검증 실패 항목은 승인할 수 없습니다" : ""}
              className="rounded-lg bg-cc-blue px-4 py-1.5 text-sm font-medium text-[#fff] hover:bg-[#2a7fe0] disabled:opacity-50">승인</button>
            <button disabled={busy} onClick={() => submit("request_review")} className="rounded-lg border border-violet-400/60 px-4 py-1.5 text-sm text-violet-200 hover:bg-violet-400/10 disabled:opacity-50">재검토 요청</button>
            <button disabled={busy} onClick={() => submit("reject")} className="rounded-lg border border-red-400/60 px-4 py-1.5 text-sm text-red-200 hover:bg-red-400/10 disabled:opacity-50">반려</button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-sky-300/70">🔒 승인·반려는 승인된 EHS 담당자만 할 수 있습니다.</p>
      )}
      {msg && <p role="alert" className={`mt-2 rounded px-2 py-1 text-sm ${msg.kind === "error" ? "border border-red-400/40 bg-red-900/30 text-red-200" : "text-emerald-200"}`}>{msg.text}</p>}
    </li>
  );
}
