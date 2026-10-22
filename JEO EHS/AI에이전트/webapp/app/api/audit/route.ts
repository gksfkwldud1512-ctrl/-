import { guard, json } from "@/lib/http";
import { getStore } from "@/lib/store";
import { verifyAuditChain } from "@/lib/store/memory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const g = await guard(request, "audit.read", { action: "audit.read", targetType: "audit", targetId: "*" });
  if ("response" in g) return g.response;
  const entries = getStore().listAudit();
  return json({ entries: entries.slice(-100).reverse(), total: entries.length, chain: verifyAuditChain(entries) });
}
