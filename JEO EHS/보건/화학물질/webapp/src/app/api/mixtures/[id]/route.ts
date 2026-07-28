import { NextResponse } from "next/server";
import { deleteMixture } from "@/lib/db/repo";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/mixtures/[id]">) {
  const { id } = await ctx.params;
  await deleteMixture(id);
  return NextResponse.json({ ok: true });
}
