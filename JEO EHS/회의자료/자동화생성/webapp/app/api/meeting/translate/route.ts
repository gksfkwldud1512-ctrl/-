import { NextResponse } from "next/server";
import { translateToEnglish } from "@/lib/translate";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const texts = (body as { texts?: unknown } | null)?.texts;
  if (!Array.isArray(texts) || !texts.every((t) => typeof t === "string")) {
    return NextResponse.json({ error: "texts: string[] 가 필요합니다." }, { status: 400 });
  }
  try {
    const translated = await translateToEnglish(texts);
    return NextResponse.json({ translated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "번역 중 오류가 발생했습니다." }, { status: 500 });
  }
}
