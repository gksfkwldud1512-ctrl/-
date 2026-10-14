// 서명된 세션 쿠키. Web Crypto만 사용해서 proxy(Edge)와 Node 라우트 양쪽에서 동일하게 동작한다.
import type { Role } from "./roles";

export const SESSION_COOKIE = "cc_session";
export const SESSION_TTL_SEC = 8 * 3600;

export type SessionUser = { id: string; name: string; role: Role };

const enc = new TextEncoder();

function toB64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64u(s: string): Uint8Array | null {
  try {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** 비밀키가 없거나 너무 짧으면 null — 이 경우 모든 인증은 실패한다(fail closed). */
export function getSecret(): string | null {
  const s = process.env.CC_SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

async function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function createSession(user: SessionUser, now = Date.now()): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const payload = toB64u(enc.encode(JSON.stringify({ sub: user.id, name: user.name, role: user.role, exp: Math.floor(now / 1000) + SESSION_TTL_SEC })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(payload)));
  return `${payload}.${toB64u(sig)}`;
}

export async function verifySession(token: string | undefined | null, now = Date.now()): Promise<SessionUser | null> {
  const secret = getSecret();
  if (!secret || !token) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const sigBytes = fromB64u(sig);
  if (!sigBytes) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), sigBytes as BufferSource, enc.encode(payload));
  if (!ok) return null;
  const raw = fromB64u(payload);
  if (!raw) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(raw)) as { sub?: string; name?: string; role?: string; exp?: number };
    if (typeof p.exp !== "number" || p.exp * 1000 < now) return null;
    if (typeof p.sub !== "string" || typeof p.name !== "string") return null;
    if (p.role !== "viewer" && p.role !== "ehs_officer" && p.role !== "admin") return null;
    return { id: p.sub, name: p.name, role: p.role };
  } catch {
    return null;
  }
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export async function authenticate(request: Request): Promise<SessionUser | null> {
  return verifySession(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
}
