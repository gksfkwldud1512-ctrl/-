import { NextResponse } from "next/server";
import { z } from "zod";
import { setRevisionChecked } from "@/lib/db/repo";

const bodySchema = z.object({ checked: z.boolean() });

export async function POST(request: Request, ctx: RouteContext<"/api/mixtures/[id]/revision-check">) {
  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const ok = await setRevisionChecked(id, parsed.data.checked);
  if (!ok) {
    return NextResponse.json({ error: "대상이 없거나 개정일이 없어 확인 처리할 수 없습니다." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
