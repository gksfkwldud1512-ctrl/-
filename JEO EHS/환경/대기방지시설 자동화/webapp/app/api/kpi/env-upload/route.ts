import { NextResponse } from "next/server";
import { loadKpiSummary, saveKpiSummary } from "@/lib/kpi/store";
import { mergeEnvPayload, validateEnvPayload } from "@/lib/kpi/mergeEnv";

export const maxDuration = 60;

// 환경종합자료(FY26 시트)는 브라우저에서 파싱해 숫자 JSON만 보낸다(원본 엑셀이 5MB라 요청 한도 4.5MB 초과).
export async function POST(request: Request) {
  let payload;
  try {
    payload = validateEnvPayload(await request.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "요청을 해석하지 못했습니다." }, { status: 400 });
  }

  const existing = await loadKpiSummary();
  const merged = mergeEnvPayload(existing, payload);
  await saveKpiSummary(merged);

  return NextResponse.json({ ok: true, uploadedAt: merged.uploadedAt });
}
