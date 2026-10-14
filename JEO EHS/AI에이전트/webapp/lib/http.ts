import { authenticate, type SessionUser } from "./auth/session";
import { can, type Permission } from "./auth/roles";
import { getStore } from "./store";

export const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** 본문은 작게만 받는다(10KB). 비밀번호·키가 로그에 남지 않도록 본문을 기록하지 않는다. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => "");
  if (!text || text.length > 10_000) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 인증 + 권한 확인. 실패하면 감사 로그(denied)를 남기고 응답을 돌려준다. */
export async function guard(
  request: Request,
  permission: Permission,
  audit: { action: string; targetType: string; targetId: string },
): Promise<{ user: SessionUser } | { response: Response }> {
  const user = await authenticate(request);
  if (!user) {
    getStore().appendAudit({ actorId: "-", actorName: "-", role: "anonymous", ...audit, outcome: "denied", code: "UNAUTHENTICATED" });
    return { response: json({ error: "UNAUTHENTICATED", message: "로그인이 필요합니다." }, 401) };
  }
  if (!can(user.role, permission)) {
    getStore().appendAudit({ actorId: user.id, actorName: user.name, role: user.role, ...audit, outcome: "denied", code: "FORBIDDEN" });
    return { response: json({ error: "FORBIDDEN", message: "권한이 없습니다." }, 403) };
  }
  return { user };
}
