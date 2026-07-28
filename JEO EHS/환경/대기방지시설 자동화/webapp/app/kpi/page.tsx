import { loadKpiSummary } from "@/lib/kpi/store";
import { computeIntensity } from "@/lib/kpi/intensity";
import { KpiTable } from "@/components/KpiTable";
import { KpiUploadForm } from "@/components/KpiUploadForm";

export const dynamic = "force-dynamic";

export default async function KpiPage() {
  const summary = await loadKpiSummary();
  const series = summary?.series;

  const energyIntensity = series ? computeIntensity(series.energy, series.salesUSD) : [];
  const wasteIntensity = series ? computeIntensity(series.waste, series.salesUSD) : [];
  const waterIntensity = series ? computeIntensity(series.water, series.salesUSD) : [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <a href="/" className="text-sm text-zinc-500 hover:underline">
          ← 대기방지시설 운영기록부
        </a>
        <h1 className="mt-2 text-2xl font-semibold">환경 KPI</h1>
        <p className="mt-1 text-sm text-zinc-500">
          SPHERA/E MASTER DETAILS 내보내기 파일을 업로드하면 에너지·폐기물·용수 강도와 Scope 1·2 배출량,
          월별 사용량을 자동으로 집계합니다.
        </p>
      </div>

      <KpiUploadForm lastUpdated={summary?.uploadedAt ?? null} sourceFilename={summary?.sourceFilename ?? null} />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-zinc-800">강도 지표 &amp; 온실가스 배출량</h2>
        <KpiTable title="에너지 강도 (총 에너지사용량 GJ / 매출액 MUSD)" unit="GJ/MUSD" points={energyIntensity} decimals={1} />
        <KpiTable title="폐기물 강도 (폐기물 발생량 ton / 매출액 MUSD)" unit="ton/MUSD" points={wasteIntensity} decimals={2} />
        <KpiTable title="용수 강도 (총용수사용량 ㎥ / 매출액 MUSD)" unit="㎥/MUSD" points={waterIntensity} decimals={1} />
        <KpiTable title="Scope 1 배출량" unit="tCO2e" points={series?.scope1 ?? []} decimals={1} />
        <KpiTable title="Scope 2 배출량" unit="tCO2e" points={series?.scope2 ?? []} decimals={1} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-zinc-800">항목별 월별 사용량</h2>
        <KpiTable title="에너지 사용량" unit="GJ" points={series?.energy ?? []} decimals={0} />
        <KpiTable title="폐기물 발생량" unit="ton" points={series?.waste ?? []} decimals={2} />
        <KpiTable title="용수 사용량" unit="㎥" points={series?.water ?? []} decimals={0} />
      </section>
    </main>
  );
}
