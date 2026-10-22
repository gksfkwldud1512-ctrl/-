import { authenticate } from "@/lib/auth/session";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await authenticate(request);
  return user ? json({ user }) : json({ error: "UNAUTHENTICATED" }, 401);
}
