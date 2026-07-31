import { NextResponse } from "next/server";
import { correctTranslation, loadGlossary } from "@/lib/glossary";

export async function GET() {
  const glossary = await loadGlossary();
  return NextResponse.json(glossary);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const ko = (body as { ko?: unknown } | null)?.ko;
  const en = (body as { en?: unknown } | null)?.en;
  if (typeof ko !== "string" || typeof en !== "string" || !ko.trim()) {
    return NextResponse.json({ error: "ko, en 문자열이 필요합니다." }, { status: 400 });
  }
  await correctTranslation(ko, en);
  return NextResponse.json({ ok: true });
}
