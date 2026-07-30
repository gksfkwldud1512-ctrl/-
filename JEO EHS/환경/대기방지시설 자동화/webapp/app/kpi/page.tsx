import { loadKpiSummary } from "@/lib/kpi/store";
import { loadSafetyPyramid } from "@/lib/kpi/safetyPyramid";
import { KpiDashboard } from "@/components/KpiDashboard";
import { KpiUploadForm } from "@/components/KpiUploadForm";
import { SafetyPyramidCard } from "@/components/SafetyPyramidCard";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import type { SeriesKey } from "@/lib/kpi/parseDetails";

export const dynamic = "force-dynamic";

export default async function KpiPage() {
  const [summary, safetyPyramid] = await Promise.all([loadKpiSummary(), loadSafetyPyramid()]);
  const fiscalYears = summary
    ? Array.from(
        new Set((Object.keys(summary.series) as SeriesKey[]).flatMap((k) => summary.series[k].map((p) => p.fiscalYear)))
      ).sort()
    : [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <a href="/" className="text-sm text-zinc-500 hover:underline">
            ← 대기방지시설 운영기록부
          </a>
          <h1 className="mt-2 text-2xl font-semibold">안전환경 KPI</h1>
          <p className="mt-1 text-sm text-zinc-500">
            SPHERA/E MASTER DETAILS 내보내기 파일을 업로드하면 에너지·폐기물·용수 강도와 Scope 1·2 배출량,
            월별 사용량을 자동으로 집계합니다.
          </p>
        </div>
        <ReportDownloadButton fiscalYears={fiscalYears} />
      </div>

      <KpiUploadForm lastUpdated={summary?.uploadedAt ?? null} sourceFilename={summary?.sourceFilename ?? null} />

      <SafetyPyramidCard
        hasImage={safetyPyramid.hasImage}
        monthly={safetyPyramid.monthly}
        updatedAt={safetyPyramid.updatedAt}
      />

      <KpiDashboard summary={summary} />
    </main>
  );
}
