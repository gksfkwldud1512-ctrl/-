import { NextResponse } from "next/server";
import { parseKpiDetailsWorkbook } from "@/lib/kpi/parseDetails";
import { saveKpiSummary, saveFailedUpload } from "@/lib/kpi/store";

export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "엑셀 파일이 필요합니다." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: ".xlsx 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let summary;
  try {
    summary = await parseKpiDetailsWorkbook(buffer, file.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : "파일을 분석하지 못했습니다.";
    // Vercel 로그에 상세 남기기 + 실패한 원본 파일 보관 — 다음에 같은 문제가 생겨도
    // 재현/재전달 없이 바로 원인을 진단할 수 있게 한다.
    console.error(`[kpi/upload] parse failed: file=${file.name} size=${file.size}B message=${message}`);
    await saveFailedUpload(buffer, file.name, message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await saveKpiSummary(summary);

  return NextResponse.json({ ok: true, uploadedAt: summary.uploadedAt });
}
