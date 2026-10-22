import { POST as loginPost } from "@/app/api/auth/login/route";

export async function loginAs(id: string, password: string): Promise<string> {
  const res = await loginPost(new Request("http://x/api/auth/login", { method: "POST", body: JSON.stringify({ id, password }) }));
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error(`login failed for ${id}: ${res.status}`);
  return cookie.split(";")[0];
}

export const officerCookie = () => loginAs("officer", "officer-pass");
export const officer2Cookie = () => loginAs("officer2", "officer2-pass");
export const viewerCookie = () => loginAs("viewer", "viewer-pass");
export const adminCookie = () => loginAs("admin", "admin-pass");

export function req(url: string, init: { method?: string; cookie?: string; body?: unknown } = {}) {
  return new Request(`http://x${url}`, {
    method: init.method ?? "GET",
    headers: init.cookie ? { cookie: init.cookie } : {},
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

let n = 0;
export const newKey = () => `key-${Date.now()}-${++n}-abcdef`;

export const decisionBody = (over: Record<string, unknown> = {}) => ({
  action: "approve", reason: "원자료와 대조해 확인했습니다", expectedVersion: 1, evidenceVersion: "ev-1",
  idempotencyKey: newKey(), confirmLegal: true, ...over,
});

export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
