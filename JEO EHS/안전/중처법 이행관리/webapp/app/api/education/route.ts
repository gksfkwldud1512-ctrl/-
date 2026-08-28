import { NextResponse } from "next/server";
import { loadEducationData, saveEducationItems, isValidCycle, type EducationItem } from "@/lib/education";

export async function GET() {
  const data = await loadEducationData();
  return NextResponse.json(data);
}

function toItem(v: unknown): EducationItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  if (!isValidCycle(o.cycleMonths)) return null;
  return {
    id: o.id,
    name: o.name,
    target: typeof o.target === "string" ? o.target : "",
    cycleMonths: o.cycleMonths,
    lastDate: typeof o.lastDate === "string" && o.lastDate ? o.lastDate : null,
    qualification: typeof o.qualification === "string" ? o.qualification : "",
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("items" in body)) {
    return NextResponse.json({ error: "items 데이터가 필요합니다." }, { status: 400 });
  }
  const rawItems = (body as { items: unknown }).items;
  if (!Array.isArray(rawItems)) {
    return NextResponse.json({ error: "items 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const cleanItems = rawItems.map(toItem).filter((t): t is EducationItem => !!t);
  const saved = await saveEducationItems(cleanItems);
  return NextResponse.json(saved);
}
