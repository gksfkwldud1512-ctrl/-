// Edge(미들웨어)와 Node(라우트 핸들러) 런타임 양쪽에서 다 쓸 수 있도록
// Web Crypto API(crypto.subtle)만 사용한다.

export const PLACEMENT_EXAM_AUTH_COOKIE = "pe_auth";

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedAuthToken(): Promise<string | null> {
  const password = process.env.PLACEMENT_EXAM_PASSWORD;
  if (!password) return null;
  return sha256Hex(password);
}
