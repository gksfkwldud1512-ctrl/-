// 서버(Node) 전용: 비밀번호 확인. 사용자 목록은 환경변수 CC_USERS(JSON)로만 둔다 — 코드·DB·로그에 비밀번호를 두지 않는다.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Role } from "./roles";
import type { SessionUser } from "./session";

type StoredUser = { id: string; name: string; role: Role; hash: string }; // hash = scrypt:salt:key (hex) — "$"는 .env 변수 확장과 충돌해서 ":"를 쓴다

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

function loadUsers(): StoredUser[] {
  try {
    const arr = JSON.parse(process.env.CC_USERS ?? "[]") as StoredUser[];
    return Array.isArray(arr) ? arr.filter((u) => u && u.id && u.name && u.hash && ["viewer", "ehs_officer", "admin"].includes(u.role)) : [];
  } catch {
    return [];
  }
}

function checkPassword(password: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// 로그인 연속 실패 잠금(메모리). 5회 실패 시 5분간 해당 ID 로그인 차단.
const fails = new Map<string, { n: number; until: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; reason: "invalid" | "locked" };

export function resetLoginLocks() {
  fails.clear();
}

export function login(id: string, password: string, now = Date.now()): LoginResult {
  const rec = fails.get(id);
  if (rec && rec.until > now) return { ok: false, reason: "locked" };
  const user = loadUsers().find((u) => u.id === id);
  // 사용자가 없어도 같은 비용의 해시 계산을 해서 응답 시간으로 ID 존재를 알 수 없게 한다.
  const good = checkPassword(password, user?.hash ?? "scrypt:00:00") && !!user;
  if (!good || !user) {
    const lockExpired = !!rec && rec.until > 0 && rec.until <= now; // 잠금이 풀렸으면 횟수를 처음부터 센다
    const n = (lockExpired ? 0 : rec?.n ?? 0) + 1;
    fails.set(id, { n, until: n >= MAX_FAILS ? now + LOCK_MS : 0 });
    return { ok: false, reason: "invalid" };
  }
  fails.delete(id);
  return { ok: true, user: { id: user.id, name: user.name, role: user.role } };
}
