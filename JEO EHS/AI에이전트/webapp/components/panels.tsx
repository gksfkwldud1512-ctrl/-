"use client";

import type { ApprovalView } from "@/lib/approval/views";
import type { AuditEntry } from "@/lib/approval/types";
import { can, ROLE_LABEL, type Role } from "@/lib/auth/roles";
import type { Run } from "@/lib/types";
import { DemoBadge } from "./badges";
import { Panel, Row } from "./ui";

export type Me = { id: string; name: string; role: Role };
export type AuditState = { entries: AuditEntry[]; total: number; chainOk: boolean } | "forbidden" | "loading" | "error";

/** 왼쪽 위: ADMIN CONTROL CENTER — 내 권한 */
export function AdminPanel({ me }: { me: Me }) {
  return (
    <Panel title="Admin Control Center">
      <div className="relative">
        <div className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-xl border border-cc-line bg-cc-card text-2xl shadow-[0_0_18px_rgba(80,192,240,0.25)]" aria-hidden>🔒</div>
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-sky-300/80">Permissions · 내 권한</h3>
        <ul className="mt-1 max-w-[calc(100%-4rem)] text-sm">
          <Row label="로그인 계정" value={`${me.name}`} />
          <Row label="역할" value={ROLE_LABEL[me.role]} />
        </ul>
        <ul className="mt-1">
          <Row label="승인·반려·재검토" ok={can(me.role, "approvals.decide")} />
          <Row label="감사 로그 열람" ok={can(me.role, "audit.read")} />
          <Row label="제한 결과물 열람" ok={can(me.role, "artifact.read.restricted")} />
        </ul>
      </div>
    </Panel>
  );
}

/** 왼쪽 가운데: POLICY SHIELD — 서버가 실제로 강제하는 정책(자동시험으로 검증) */
export function PolicyShield() {
  const policies = [
    "법적 판정·외부 제출은 EHS 담당자만 확정",
    "승인 직전 서버가 최종 검증을 다시 실행",
    "감사 로그는 해시로 연결 — 변조 즉시 탐지",
    "제한 결과물 열람 통제·열람 기록",
    "AI 유료 호출 차단(비용 0원)",
  ];
  return (
    <Panel title="Policy Shield">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 64 76" className="h-20 w-16 shrink-0 drop-shadow-[0_2px_6px_rgba(31,111,208,0.3)]" aria-hidden>
          <path d="M32 3 L60 14 V38 C60 56 47 68 32 73 C17 68 4 56 4 38 V14 Z" fill="#e6f1fc" stroke="#1f6fd0" strokeWidth="3" />
          <path d="M19 38 L29 48 L46 28" fill="none" stroke="#1f6fd0" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">정책 적용 중</h3>
          <ul className="mt-1 space-y-0.5 text-xs text-sky-100/90">
            {policies.map((p) => (
              <li key={p} className="flex gap-1.5"><span className="text-cc-green" aria-hidden>✓</span>{p}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-2 text-right text-xs text-cc-cyan">모든 정책 활성</p>
    </Panel>
  );
}

/** 왼쪽 아래: DATA CLASSIFICATION */
export function DataClassification({ approvals }: { approvals: ApprovalView[] | null }) {
  const restricted = approvals?.filter((a) => a.kind !== "internal_record").length ?? 0;
  const internal = approvals?.filter((a) => a.kind === "internal_record").length ?? 0;
  const arts = approvals?.flatMap((a) => a.artifacts) ?? [];
  const restrictedArts = arts.filter((a) => a.restricted).length;
  const rows = [
    { c: "bg-cc-red", label: "제한 (법적 판정·외부 제출)", n: restricted },
    { c: "bg-cc-orange", label: "제한 결과물", n: restrictedArts },
    { c: "bg-cc-blue", label: "내부 기록", n: internal },
    { c: "bg-slate-400", label: "일반 결과물", n: arts.length - restrictedArts },
  ];
  return (
    <Panel title="Data Classification">
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-sky-100/90"><span className={`h-3 w-3 rounded-full ${r.c}`} aria-hidden />{r.label}</span>
            <span className="font-bold tabular-nums text-white">{approvals ? r.n : "–"}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const ACTION_LABEL: Record<string, { icon: string; text: string }> = {
  approve: { icon: "✅", text: "승인" }, reject: { icon: "⛔", text: "반려" }, request_review: { icon: "🔁", text: "재검토 요청" },
  "artifact.read": { icon: "📄", text: "결과물 열람" }, login: { icon: "🔑", text: "로그인" }, decide: { icon: "🛑", text: "결정 시도" },
  "approvals.list": { icon: "📋", text: "목록 조회" }, "audit.read": { icon: "🧾", text: "감사 로그 열람" },
};
const OUTCOME: Record<string, { text: string; cls: string }> = {
  allowed: { text: "허용", cls: "text-emerald-300" }, denied: { text: "거부", cls: "text-red-300" },
  conflict: { text: "충돌", cls: "text-orange-300" }, invalid: { text: "무효", cls: "text-slate-300" },
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

/** 오른쪽 위: AUDIT LOG (서버에 기록된 실제 감사 로그) */
export function AuditPanel({ audit, onOpen }: { audit: AuditState; onOpen?: () => void }) {
  return (
    <Panel title="Audit Log" action={onOpen && <button onClick={onOpen} className="text-xs text-cc-cyan hover:underline">전체 보기</button>}>
      {audit === "loading" && <p className="text-sm text-sky-200/70">불러오는 중...</p>}
      {audit === "error" && <p className="text-sm text-red-300">감사 로그를 불러오지 못했습니다.</p>}
      {audit === "forbidden" && <p className="text-sm text-sky-200/70">🔒 감사 로그는 EHS 담당자·관리자만 볼 수 있습니다.</p>}
      {typeof audit === "object" && (
        <>
          {audit.entries.length === 0 && <p className="text-sm text-sky-200/70">아직 기록이 없습니다.</p>}
          <ul className="space-y-2">
            {audit.entries.slice(0, 6).map((e) => {
              const a = ACTION_LABEL[e.action] ?? { icon: "•", text: e.action };
              const o = OUTCOME[e.outcome];
              return (
                <li key={e.seq} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-lg" aria-hidden>{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sky-50">{a.text}{e.targetId !== "-" && <span className="text-sky-300/70"> · {e.targetId}</span>}</div>
                    <div className="truncate text-xs text-sky-300/70">{e.actorName === "-" ? "비로그인" : e.actorName} · <span className={o.cls}>{o.text}</span></div>
                  </div>
                  <time className="shrink-0 text-xs text-sky-300/70" dateTime={e.at}>{hhmm(e.at)}</time>
                </li>
              );
            })}
          </ul>
          <p className={`mt-3 border-t border-white/10 pt-2 text-center text-xs ${audit.chainOk ? "text-sky-300/80" : "font-bold text-red-300"}`}>
            {audit.chainOk ? `전체 ${audit.total}건 · 모든 기록은 해시로 연결되어 변경할 수 없습니다 ✓` : "⚠️ 감사 로그 무결성 오류가 탐지되었습니다"}
          </p>
        </>
      )}
    </Panel>
  );
}

/** 오른쪽 아래: 비용 — 사진의 "Spending & Credits" 자리. 실제로 AI를 호출하지 않으므로 0으로 정직하게 표시 */
export function CostPanel({ runs }: { runs: Run[] }) {
  const steps = runs.flatMap((r) => r.steps);
  const rule = steps.filter((s) => s.executor === "rule").length;
  const human = steps.filter((s) => s.executor === "human").length;
  const ai = steps.filter((s) => s.executor === "ai").length;
  return (
    <Panel title="Spending & Credits" action={<DemoBadge />}>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 120 70" className="w-32 shrink-0" role="img" aria-label="AI 유료 호출 사용량 0퍼센트">
          <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="#dbe7f2" strokeWidth="11" strokeLinecap="round" />
          <path d="M10 62 A50 50 0 0 1 12 55" fill="none" stroke="#15803d" strokeWidth="11" strokeLinecap="round" />
          <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight="700" fill="#0f2a44">0%</text>
        </svg>
        <div>
          <div className="text-sm font-bold text-white">이번 달 비용 0원</div>
          <div className="text-xs text-sky-300/80">AI 유료 호출 0건</div>
        </div>
      </div>
      <h3 className="mt-3 text-[11px] font-bold uppercase tracking-wide text-sky-300/80">실행 방식별 단계 수 (샘플)</h3>
      <ul className="mt-1">
        <Row label="⚙️ 규칙 기반" value={rule} />
        <Row label="🙋 사람 승인" value={human} />
        <Row label="🤖 AI (유료)" value={ai} />
      </ul>
    </Panel>
  );
}

/** 하단 바: GOVERNANCE & RISK OVERVIEW */
export function GovernanceBar({ approvals, audit }: { approvals: ApprovalView[] | null; audit: AuditState }) {
  const pending = approvals?.filter((a) => a.status === "pending").length ?? 0;
  const failed = approvals?.filter((a) => a.status === "pending" && a.verification && !a.verification.ok).length ?? 0;
  const chain = typeof audit === "object" ? (audit.chainOk ? "ok" : "bad") : "unknown";
  const items = [
    { ok: true, title: "데이터 보호", sub: "제한 결과물 접근 통제 중" },
    { ok: pending === 0, title: "승인 대기", sub: pending === 0 ? "대기 없음" : `${pending}건 담당자 확인 필요` },
    { ok: failed === 0, title: "최종 검증", sub: failed === 0 ? "실패 없음" : `${failed}건 승인 차단됨` },
    { ok: chain !== "bad", title: "감사 무결성", sub: chain === "ok" ? "해시 연결 정상" : chain === "bad" ? "변조 탐지!" : "권한자만 확인 가능" },
  ];
  return (
    <Panel title="Governance & Risk Overview" className="flex h-full flex-col">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:h-full lg:content-center">
        {items.map((i) => (
          <li key={i.title} className="flex items-center gap-2">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${i.ok ? "bg-cc-green/20 text-cc-green ring-1 ring-cc-green/50" : "bg-cc-orange/20 text-orange-300 ring-1 ring-cc-orange/60"}`} aria-hidden>{i.ok ? "✓" : "!"}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">{i.title}</div>
              <div className={`truncate text-xs ${i.ok ? "text-cc-green" : "text-orange-300"}`}>{i.sub}</div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** 하단 오른쪽: GOVERNANCE WARNING */
export function GovernanceWarning({ approvals, onOpen }: { approvals: ApprovalView[] | null; onOpen: () => void }) {
  const failed = approvals?.filter((a) => a.status === "pending" && a.verification && !a.verification.ok) ?? [];
  const restrictedPending = approvals?.filter((a) => a.status === "pending" && a.kind !== "internal_record").length ?? 0;
  const has = failed.length > 0 || restrictedPending > 0;
  return (
    <section className={`h-full rounded-xl border-2 p-4 ${has ? "border-amber-400/80 bg-amber-950/40 shadow-[0_0_24px_rgba(251,191,36,0.15)]" : "border-cc-line bg-cc-panel/85"}`} role={has ? "alert" : undefined}>
      <div className="flex gap-3">
        <span className="text-3xl" aria-hidden>{has ? "⚠️" : "🛡️"}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-300">{has ? "Governance Warning" : "Governance"}</h2>
          {has ? (
            <p className="mt-1 text-sm text-sky-50">
              법적 의무 판정·외부 제출 {restrictedPending}건이 담당자 확인을 기다립니다.
              {failed.length > 0 && ` 이 중 ${failed.length}건은 최종 검증에 실패했습니다 — 외부로 내보내기 전에 원인을 확인하세요.`}
            </p>
          ) : (
            <p className="mt-1 text-sm text-sky-100/80">현재 경고가 없습니다.</p>
          )}
          {has && <button onClick={onOpen} className="mt-2 text-sm font-medium text-amber-300 hover:underline">승인센터에서 확인 →</button>}
        </div>
      </div>
    </section>
  );
}
