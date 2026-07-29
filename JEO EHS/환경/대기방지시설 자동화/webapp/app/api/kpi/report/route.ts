import { NextResponse } from "next/server";
import { loadKpiSummary } from "@/lib/kpi/store";
import { buildKpiReportPptx } from "@/lib/kpi/report";
import type { SeriesKey } from "@/lib/kpi/parseDetails";

export const maxDuration = 60;

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
  const filename = `환경KPI_${fiscalYear.replace("/", "-")}.pptx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
