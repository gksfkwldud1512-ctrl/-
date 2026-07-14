import { NextResponse } from "next/server";
import { z } from "zod";
import { replaceIngredients } from "@/lib/db/repo";

const bodySchema = z.object({
  productName: z.string().optional(),
  ingredients: z.array(
    z.object({
      ingredientName: z.string().min(1),
      casNo: z.string().nullable(),
      contentPercentRaw: z.string().nullable(),
    })
  ),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/mixtures/[id]/ingredients">) {
  const { id } = await ctx.params;
  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await replaceIngredients(id, parsed.data.ingredients, parsed.data.productName);

  return NextResponse.json({ ok: true });
}
