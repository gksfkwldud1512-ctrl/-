import { SESSION_COOKIE, SESSION_TTL_SEC, createSession } from "@/lib/auth/session";
import { login } from "@/lib/auth/users";
import { json, readJson } from "@/lib/http";
import { BASE } from "@/lib/base";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request);
  const id = typeof body?.id === "string" ? body.id.slice(0, 50) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  if (!id || !password) return json({ error: "INVALID", message: "아이디와 비밀번호를 입력하세요." }, 400);

  const result = login(id, password);
  const store = getStore();
  if (!result.ok) {
    store.appendAudit({ actorId: id, actorName: "-", role: "anonymous", action: "login", targetType: "session", targetId: "-", outcome: "denied", code: result.reason === "locked" ? "LOCKED" : "BAD_CREDENTIALS" });
    return result.reason === "locked"
      ? json({ error: "LOCKED", message: "실패가 반복되어 5분간 잠겼습니다." }, 429)
      : json({ error: "BAD_CREDENTIALS", message: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
  }
  const token = await createSession(result.user);
  if (!token) return json({ error: "SERVER_MISCONFIGURED", message: "서버 인증 설정이 없습니다." }, 500);
  store.appendAudit({ actorId: result.user.id, actorName: result.user.name, role: result.user.role, action: "login", targetType: "session", targetId: "-", outcome: "allowed" });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return json({ user: result.user }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=${BASE || "/"}; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${secure}`,
  });
}
