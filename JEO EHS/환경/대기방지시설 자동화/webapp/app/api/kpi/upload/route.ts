import { NextResponse } from "next/server";
import { parseKpiDetailsWorkbook } from "@/lib/kpi/parseDetails";
import { saveKpiSummary } from "@/lib/kpi/store";

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "파일을 분석하지 못했습니다." },
      { status: 400 }
    );
  }

  await saveKpiSummary(summary);

  return NextResponse.json({ ok: true, uploadedAt: summary.uploadedAt });
}
