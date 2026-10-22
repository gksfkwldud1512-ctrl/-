import { NextResponse } from "next/server";
import { z } from "zod";
import { replaceIngredients } from "@/lib/db/repo";

const bodySchema = z.object({
  productName: z.string().optional(),
  manufacturer: z.string().nullable().optional(),
  materialType: z.enum(["raw", "auxiliary"]).optional(),
  department: z.string().nullable().optional(),
  workProcess: z.string().nullable().optional(),
  revisionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  reviewCycleYears: z.number().int().positive().nullable().optional(),
  ppeText: z.string().nullable().optional(),
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

  await replaceIngredients(id, parsed.data.ingredients, {
    productName: parsed.data.productName,
    manufacturer: parsed.data.manufacturer,
    materialType: parsed.data.materialType,
    department: parsed.data.department,
    workProcess: parsed.data.workProcess,
    revisionDate: parsed.data.revisionDate,
    reviewCycleYears: parsed.data.reviewCycleYears,
    ppeText: parsed.data.ppeText,
  });

  return NextResponse.json({ ok: true });
}
