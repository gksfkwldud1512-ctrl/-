import { NextResponse } from "next/server";
import { confirmMixture } from "@/lib/db/repo";

export async function POST(_request: Request, ctx: RouteContext<"/api/mixtures/[id]/confirm">) {
  const { id } = await ctx.params;
  const overallVerdict = await confirmMixture(id);
  return NextResponse.json({ overallVerdict });
}
