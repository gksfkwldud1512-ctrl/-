import { NextResponse } from "next/server";
import {
  loadSafetyPyramid,
  saveSafetyPyramid,
  SAFETY_CATEGORIES,
  type SafetyMonthly,
  type SafetyTargets,
} from "@/lib/kpi/safetyPyramid";
import { FISCAL_MONTHS } from "@/lib/kpi/parseDetails";

export async function GET() {
  const data = await loadSafetyPyramid();
  return NextResponse.json(data);
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("monthly" in body) || !("targets" in body)) {
    return NextResponse.json({ error: "monthly/targets 데이터가 필요합니다." }, { status: 400 });
  }

  const rawMonthly = (body as { monthly: unknown }).monthly;
  const rawTargets = (body as { targets: unknown }).targets;
  if (!rawMonthly || typeof rawMonthly !== "object" || !rawTargets || typeof rawTargets !== "object") {
    return NextResponse.json({ error: "monthly/targets 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // 알려진 카테고리/월만 숫자로 정제해서 저장한다(임의 키 주입 방지).
  const cleanMonthly: SafetyMonthly = {} as SafetyMonthly;
  const cleanTargets: SafetyTargets = {} as SafetyTargets;
  for (const cat of SAFETY_CATEGORIES) {
    const catRow = (rawMonthly as Record<string, unknown>)[cat.key];
    cleanMonthly[cat.key] = {};
    if (catRow && typeof catRow === "object") {
      for (const m of FISCAL_MONTHS) {
        const n = toNumber((catRow as Record<string, unknown>)[m]);
        if (n !== null) cleanMonthly[cat.key][m] = n;
      }
    }
    cleanTargets[cat.key] = toNumber((rawTargets as Record<string, unknown>)[cat.key]) ?? 0;
  }

  const saved = await saveSafetyPyramid(cleanMonthly, cleanTargets);
  return NextResponse.json(saved);
}
