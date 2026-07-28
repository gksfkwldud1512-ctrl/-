import { NextResponse } from "next/server";
import { seedReferenceData } from "@/lib/seed/seedReferenceData";

export const maxDuration = 300;

/**
 * 기준 데이터(5개 xlsx) 재시딩용 엔드포인트. 인증 시스템이 없는 앱이므로
 * 누구나 트리거하지 못하도록 공유 비밀 토큰(x-seed-token 헤더)으로 보호한다.
 * 로컬 개발 시에는 `npm run seed` 스크립트를 직접 실행하는 편이 더 간단하다.
 */
export async function POST(request: Request) {
  const token = request.headers.get("x-seed-token");
  if (!process.env.SEED_TOKEN || token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const logs: string[] = [];
  const summary = await seedReferenceData((msg) => logs.push(msg));

  return NextResponse.json({ summary, logs });
}
