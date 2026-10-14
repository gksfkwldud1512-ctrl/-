// 메모리 저장소 — 1단계 구현. 인터페이스(메서드)는 나중에 Postgres로 바꿔도 같게 유지한다:
//  compareAndSet  → UPDATE ... WHERE id=$1 AND version=$2 AND status='pending'
//  appendAudit    → INSERT only (UPDATE/DELETE 금지)
// ⚠️ 서버를 껐다 켜거나 서버리스 인스턴스가 바뀌면 내용이 사라진다. DEMO 전용.
import { createHash } from "node:crypto";
import type { Approval, Artifact, AuditEntry, Decision, RunEvent } from "../approval/types";

const GENESIS = "0".repeat(64);
const hashEntry = (e: Omit<AuditEntry, "hash">) => createHash("sha256").update(JSON.stringify(e)).digest("hex");

export type NewAudit = Omit<AuditEntry, "seq" | "at" | "prevHash" | "hash">;

export class MemoryStore {
  private approvals = new Map<string, Approval>();
  private events = new Map<string, RunEvent[]>();
  private artifacts = new Map<string, Artifact>();
  private audit: AuditEntry[] = [];
  private idem = new Map<string, { approvalId: string; decision: Decision }>();

  constructor(seed?: { approvals: Approval[]; events: RunEvent[]; artifacts: Artifact[] }) {
    if (!seed) return;
    for (const a of seed.approvals) this.approvals.set(a.id, structuredClone(a));
    for (const e of seed.events) this.events.set(e.runId, [...(this.events.get(e.runId) ?? []), structuredClone(e)]);
    for (const a of seed.artifacts) this.artifacts.set(a.id, structuredClone(a));
  }

  listApprovals(): Approval[] {
    return [...this.approvals.values()].map((a) => structuredClone(a));
  }
  getApproval(id: string): Approval | null {
    const a = this.approvals.get(id);
    return a ? structuredClone(a) : null;
  }
  eventsOf(runId: string): RunEvent[] {
    return structuredClone(this.events.get(runId) ?? []);
  }
  getArtifact(id: string): Artifact | null {
    const a = this.artifacts.get(id);
    return a ? structuredClone(a) : null;
  }
  getArtifacts(ids: string[]): Artifact[] {
    return ids.map((id) => this.getArtifact(id)).filter((a): a is Artifact => !!a);
  }

  /** 결정 반영 — 버전과 상태가 기대와 같을 때만 성공(동시 수정 방지). */
  compareAndSet(id: string, expectedVersion: number, decision: Decision, nextStatus: Approval["status"], idemKey: string): boolean {
    const cur = this.approvals.get(id);
    if (!cur || cur.version !== expectedVersion || cur.status !== "pending") return false;
    cur.status = nextStatus;
    cur.version += 1;
    cur.decision = decision;
    cur.history.push(decision);
    this.idem.set(idemKey, { approvalId: id, decision });
    return true;
  }

  getIdempotent(key: string) {
    const v = this.idem.get(key);
    return v ? structuredClone(v) : null;
  }

  /** 에이전트(서버 작업)가 근거·초안을 바꿔 다시 제출. 버전과 근거 버전이 올라간다. */
  resubmit(id: string, patch: { draft: string; evidence?: string[]; evidenceVersion: string }): Approval | null {
    const cur = this.approvals.get(id);
    if (!cur || cur.status === "approved" || cur.status === "rejected") return null;
    cur.draft = patch.draft;
    if (patch.evidence) cur.evidence = patch.evidence;
    cur.evidenceVersion = patch.evidenceVersion;
    cur.status = "pending";
    cur.version += 1;
    return structuredClone(cur);
  }

  /** 추가 전용 감사 로그. 앞 항목의 해시를 이어 붙여 사후 변조/삭제를 탐지한다. */
  appendAudit(e: NewAudit, now = new Date()): AuditEntry {
    const prev = this.audit.at(-1);
    const base = { ...e, seq: (prev?.seq ?? 0) + 1, at: now.toISOString(), prevHash: prev?.hash ?? GENESIS };
    const entry: AuditEntry = { ...base, hash: hashEntry(base) };
    this.audit.push(entry);
    return structuredClone(entry);
  }
  listAudit(): AuditEntry[] {
    return structuredClone(this.audit);
  }

  /** 테스트 전용: 저장된 감사 로그를 직접 변조해 탐지되는지 확인. */
  _tamperAuditForTest(index: number, patch: Partial<AuditEntry>) {
    Object.assign(this.audit[index], patch);
  }
  _tamperArtifactForTest(id: string, content: string) {
    const a = this.artifacts.get(id);
    if (a) a.content = content;
  }
  _dropEventForTest(runId: string, seq: number) {
    this.events.set(runId, (this.events.get(runId) ?? []).filter((e) => e.seq !== seq));
  }
}

export function verifyAuditChain(entries: AuditEntry[]): { ok: boolean; brokenAt?: number } {
  let prev = GENESIS;
  for (const e of entries) {
    const { hash, ...rest } = e;
    if (e.prevHash !== prev || hashEntry(rest) !== hash) return { ok: false, brokenAt: e.seq };
    prev = hash;
  }
  return { ok: true };
}
