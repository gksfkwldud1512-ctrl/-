import { describe, expect, it } from "vitest";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as meGet } from "@/app/api/auth/me/route";
import { createSession, verifySession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { req } from "./helpers";

const login = (id: string, password: string) => loginPost(req("/api/auth/login", { method: "POST", body: { id, password } }));

describe("인증", () => {
  it("올바른 로그인 → HttpOnly 쿠키", async () => {
    const res = await login("officer", "officer-pass");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });
  it("틀린 비밀번호/없는 ID는 같은 응답(ID 존재 여부 노출 없음)", async () => {
    const a = await login("officer", "wrong");
    const b = await login("ghost", "wrong");
    expect(a.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
  });
  it("5회 실패 시 잠금(올바른 비밀번호도 429)", async () => {
    for (let i = 0; i < 5; i++) await login("viewer", "bad");
    expect((await login("viewer", "viewer-pass")).status).toBe(429);
  });
  it("만료된 세션은 거부", async () => {
    const tok = (await createSession({ id: "officer", name: "x", role: "ehs_officer" }, Date.now() - 9 * 3600 * 1000))!;
    expect(await verifySession(tok)).toBeNull();
  });
  it("역할을 바꿔치기한 토큰은 거부(서명 불일치)", async () => {
    const tok = (await createSession({ id: "viewer", name: "x", role: "viewer" }))!;
    const [, sig] = tok.split(".");
    const forged = btoa(JSON.stringify({ sub: "viewer", name: "x", role: "ehs_officer", exp: 9999999999 })).replace(/=+$/, "");
    expect(await verifySession(`${forged}.${sig}`)).toBeNull();
  });
  it("비밀키 미설정 시 모두 거부(fail closed)", async () => {
    const tok = (await createSession({ id: "officer", name: "x", role: "ehs_officer" }))!;
    const saved = process.env.CC_SESSION_SECRET;
    delete process.env.CC_SESSION_SECRET;
    expect(await verifySession(tok)).toBeNull();
    process.env.CC_SESSION_SECRET = saved;
  });
  it("/api/auth/me는 쿠키 없으면 401", async () => {
    expect((await meGet(req("/api/auth/me"))).status).toBe(401);
  });
  it("권한표", () => {
    expect(can("ehs_officer", "approvals.decide")).toBe(true);
    expect(can("admin", "approvals.decide")).toBe(false);
    expect(can("viewer", "audit.read")).toBe(false);
  });
});
