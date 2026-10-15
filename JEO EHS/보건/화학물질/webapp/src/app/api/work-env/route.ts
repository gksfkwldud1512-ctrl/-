import { NextResponse } from "next/server";
import { loadWorkEnvState, updateWorkEnvState } from "@/lib/workEnvStore";
import { cleanExclusion } from "@/lib/workEnv";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadWorkEnvState());
}

type Body =
  | { type: "night"; key: string; value: boolean }
  | { type: "exclusion"; exclusion: unknown }
  | { type: "exclusion-clear"; mixtureId: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object" || !("type" in body)) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (body.type === "night") {
    if (typeof body.key !== "string" || !body.key || body.key.length > 100 || typeof body.value !== "boolean") {
      return NextResponse.json({ error: "야간근무 체크 값이 올바르지 않습니다." }, { status: 400 });
    }
    const next = await updateWorkEnvState((s) => {
      const set = new Set(s.nightWorkers);
      if (body.value) set.add(body.key);
      else set.delete(body.key);
      s.nightWorkers = Array.from(set);
    });
    return NextResponse.json(next);
  }

  if (body.type === "exclusion") {
    const ex = cleanExclusion(body.exclusion);
    if (!ex) return NextResponse.json({ error: "사용시간 입력 값이 올바르지 않습니다." }, { status: 400 });
    const next = await updateWorkEnvState((s) => {
      const prev = s.exclusions[ex.mixtureId];
      // 확인자가 있으면 확인 시각을 남긴다. 같은 확인자로 다시 저장해도 최초 확인 시각을 유지한다.
      ex.confirmedAt = ex.confirmedBy ? (prev?.confirmedBy === ex.confirmedBy && prev.confirmedAt ? prev.confirmedAt : new Date().toISOString()) : null;
      s.exclusions[ex.mixtureId] = ex;
    });
    return NextResponse.json(next);
  }

  if (body.type === "exclusion-clear") {
    if (typeof body.mixtureId !== "string" || !body.mixtureId) {
      return NextResponse.json({ error: "mixtureId가 필요합니다." }, { status: 400 });
    }
    const next = await updateWorkEnvState((s) => {
      delete s.exclusions[body.mixtureId];
    });
    return NextResponse.json(next);
  }

  return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
}
