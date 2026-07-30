import { NextResponse } from "next/server";
import { loadSafetyPyramid, saveSafetyMonthly, SAFETY_CATEGORIES, type SafetyMonthly } from "@/lib/kpi/safetyPyramid";
import { FISCAL_MONTHS } from "@/lib/kpi/parseDetails";

export async function GET() {
  const data = await loadSafetyPyramid();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("monthly" in body)) {
    return NextResponse.json({ error: "monthly 데이터가 필요합니다." }, { status: 400 });
  }

  const rawMonthly = (body as { monthly: unknown }).monthly;
  if (!rawMonthly || typeof rawMonthly !== "object") {
    return NextResponse.json({ error: "monthly 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // 알려진 카테고리/월만 숫자로 정제해서 저장한다(임의 키 주입 방지).
  const clean: SafetyMonthly = {} as SafetyMonthly;
  for (const cat of SAFETY_CATEGORIES) {
    const catRow = (rawMonthly as Record<string, unknown>)[cat.key];
    clean[cat.key] = {};
    if (catRow && typeof catRow === "object") {
      for (const m of FISCAL_MONTHS) {
        const v = (catRow as Record<string, unknown>)[m];
        if (typeof v === "number" && Number.isFinite(v)) clean[cat.key][m] = v;
        else if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) clean[cat.key][m] = Number(v);
      }
    }
  }

  const saved = await saveSafetyMonthly(clean);
  return NextResponse.json(saved);
}
