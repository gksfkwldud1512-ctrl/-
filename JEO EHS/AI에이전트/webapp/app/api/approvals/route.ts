import { guard, json } from "@/lib/http";
import { getStore } from "@/lib/store";
import { toView } from "@/lib/approval/views";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const g = await guard(request, "approvals.read", { action: "approvals.list", targetType: "approval", targetId: "*" });
  if ("response" in g) return g.response;
  const store = getStore();
  return json({ approvals: store.listApprovals().map((a) => toView(store, g.user, a)), demo: true });
}
