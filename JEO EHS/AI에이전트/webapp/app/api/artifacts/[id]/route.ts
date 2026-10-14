import { canOpenArtifact } from "@/lib/approval/views";
import { sha256 } from "@/lib/approval/verify";
import { guard, json } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 결과물 열람. 제한 결과물(법적 판정·외부 제출)은 EHS 담당자/관리자만. 열람은 허용·거부 모두 감사 로그에 남는다. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(request, "approvals.read", { action: "artifact.read", targetType: "artifact", targetId: id.slice(0, 50) });
  if ("response" in g) return g.response;

  const store = getStore();
  const art = store.getArtifact(id);
  if (!art) return json({ error: "NOT_FOUND", message: "결과물을 찾을 수 없습니다." }, 404);
  const audit = { actorId: g.user.id, actorName: g.user.name, role: g.user.role, action: "artifact.read", targetType: "artifact", targetId: id };

  if (!canOpenArtifact(g.user, art)) {
    store.appendAudit({ ...audit, outcome: "denied", code: "FORBIDDEN" });
    return json({ error: "FORBIDDEN", message: "이 결과물을 열람할 권한이 없습니다." }, 403);
  }
  const intact = sha256(art.content) === art.sha256;
  store.appendAudit({ ...audit, outcome: "allowed", code: intact ? undefined : "INTEGRITY_MISMATCH" });
  if (!intact) return json({ error: "INTEGRITY_MISMATCH", message: "결과물 해시가 일치하지 않아 제공하지 않습니다." }, 409);
  return json({ id: art.id, name: art.name, sha256: art.sha256, sizeBytes: art.sizeBytes, content: art.content });
}
