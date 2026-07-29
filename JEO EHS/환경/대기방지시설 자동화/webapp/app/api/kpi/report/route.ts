import { NextResponse } from "next/server";
import { loadKpiSummary } from "@/lib/kpi/store";
import { buildKpiReportPptx } from "@/lib/kpi/report";
import type { SeriesKey } from "@/lib/kpi/parseDetails";

export const maxDuration = 60;

function pptxResponse(buffer: Buffer, baseFilename: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
  const filename = `${baseFilename}_${stamp}.pptx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "Content-Length": String(buffer.length),
    },
  });
}

export async function GET(request: Request) {
  const summary = await loadKpiSummary();
  if (!summary) {
    return NextResponse.json({ error: "업로드된 데이터가 없습니다." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const requestedFy = searchParams.get("fy");

  const allFiscalYears = Array.from(
    new Set((Object.keys(summary.series) as SeriesKey[]).flatMap((k) => summary.series[k].map((p) => p.fiscalYear)))
  ).sort();
  const fiscalYear = requestedFy && allFiscalYears.includes(requestedFy) ? requestedFy : allFiscalYears[allFiscalYears.length - 1];

  if (!fiscalYear) {
    return NextResponse.json({ error: "회계연도 데이터를 찾을 수 없습니다." }, { status: 404 });
  }

  const buffer = await buildKpiReportPptx(summary, fiscalYear);
  // 파일명에 타임스탬프를 붙여 매번 새 이름으로 받게 한다 — 예전에 실패했던 버전과 같은 파일명으로
  // 받으면 PowerPoint/Windows가 예전 자동복구 캐시를 그대로 보여주는 것으로 의심되는 현상이 있었다.
  return pptxResponse(buffer, `환경KPI_${fiscalYear.replace("/", "-")}`);
}
