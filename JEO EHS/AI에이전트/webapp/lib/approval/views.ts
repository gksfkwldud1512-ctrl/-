import { can } from "../auth/roles";
import type { SessionUser } from "../auth/session";
import type { MemoryStore } from "../store/memory";
import { isRestricted, type Approval, type Artifact, type Verification } from "./types";
import { finalVerify } from "./verify";

export type ArtifactMeta = { id: string; name: string; restricted: boolean; sizeBytes: number; sha256Short: string; canOpen: boolean };

export type ApprovalView = Omit<Approval, "draft" | "evidence" | "onApprove"> & {
  draft: string | null;
  evidence: string[] | null;
  onApprove: string | null;
  redacted: boolean; // 권한이 없어 내용을 가렸는가
  artifacts: ArtifactMeta[];
  verification: Verification | null; // 결정 권한자에게만 제공
  canDecide: boolean;
};

export function canOpenArtifact(user: SessionUser, a: Pick<Artifact, "restricted">): boolean {
  return !a.restricted || can(user.role, "artifact.read.restricted");
}

/** 권한에 따라 가린 뷰. 조회 전용 사용자는 제한 종류의 초안·근거·결과물 내용을 받지 못한다. */
export function toView(store: MemoryStore, user: SessionUser, a: Approval): ApprovalView {
  const redacted = isRestricted(a.kind) && !can(user.role, "artifact.read.restricted");
  const arts = store.getArtifacts(a.artifactIds);
  return {
    ...a,
    draft: redacted ? null : a.draft,
    evidence: redacted ? null : a.evidence,
    onApprove: redacted ? null : a.onApprove,
    redacted,
    artifacts: arts.map((x) => ({
      id: x.id, name: redacted ? "(권한 없음)" : x.name, restricted: x.restricted, sizeBytes: x.sizeBytes,
      sha256Short: x.sha256.slice(0, 12), canOpen: canOpenArtifact(user, x),
    })),
    verification: can(user.role, "approvals.decide") ? finalVerify(a, store.eventsOf(a.runId), arts) : null,
    canDecide: can(user.role, "approvals.decide") && a.status === "pending",
  };
}
