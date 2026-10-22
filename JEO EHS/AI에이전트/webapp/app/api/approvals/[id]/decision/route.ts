import { decide } from "@/lib/approval/decide";
import { toView } from "@/lib/approval/views";
import { guard, json, readJson } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 권한 없는 요청은 여기서 즉시 거부되고 감사 로그(denied)에 남는다.
  const g = await guard(request, "approvals.decide", { action: "decide", targetType: "approval", targetId: id.slice(0, 50) });
  if ("response" in g) return g.response;

  const body = await readJson(request);
  if (!body) return json({ error: "INVALID", message: "요청 본문이 올바르지 않습니다." }, 400);

  const store = getStore();
  const result = decide(store, g.user, {
    approvalId: id, action: body.action, reason: body.reason, expectedVersion: body.expectedVersion,
    evidenceVersion: body.evidenceVersion, idempotencyKey: body.idempotencyKey, confirmLegal: body.confirmLegal,
  });
  if (!result.ok) return json({ error: result.code, message: result.message, verification: result.verification ?? null }, result.status);
  return json({ approval: toView(store, g.user, result.approval), replay: result.replay });
}
