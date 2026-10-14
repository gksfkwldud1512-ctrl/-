import { SESSION_COOKIE } from "@/lib/auth/session";
import { BASE } from "@/lib/base";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  return json({ ok: true }, 200, { "Set-Cookie": `${SESSION_COOKIE}=; Path=${BASE || "/"}; HttpOnly; SameSite=Lax; Max-Age=0` });
}
