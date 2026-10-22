import { loadKpiSummary } from "@/lib/kpi/store";
import { loadFacilitySpecs } from "@/lib/kpi/facilitySpecs";
import { WaterManagement } from "@/components/WaterManagement";
import { WastewaterLogPanel } from "@/components/WastewaterLogPanel";
import { loadManifests } from "@/lib/water/manifests";
import { buildWastewaterPlan } from "@/lib/water/wastewaterPlan";

export const dynamic = "force-dynamic";

export default async function WaterPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: yearParam } = await searchParams;
  const [summary, facilitySpecs, manifests] = await Promise.all([
    loadKpiSummary(),
    loadFacilitySpecs(),
    loadManifests(),
  ]);

  const currentYear = new Date().getFullYear();
  const years = Array.from(new Set([currentYear, ...manifests.map((m) => Number(m.date.slice(0, 4)))])).sort((a, b) => b - a);
  const year = Number(yearParam) || years[0];
  const plan = buildWastewaterPlan(manifests, year);
  const wastewaterSummary = {
    year,
    dayCount: plan.days.length,
    pageCount: Math.ceil(plan.days.length / 27),
    maxStorage: plan.maxStorage,
    lastDate: plan.days.at(-1)?.date ?? null,
    warnings: plan.days.length === 0 ? [] : plan.warnings,
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <a href="/kpi" className="text-sm text-zinc-500 hover:underline">
          ← 안전환경 KPI
        </a>
        <h1 className="mt-2 text-2xl font-semibold">용수관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          안전환경 KPI에서 업로드한 DETAILS 파일의 용수 취수·배출 데이터를 시설배치도와 월별 표로 보여줍니다.
          별도 업로드는 필요 없습니다. 폐수일지는 아래에서 위탁인계서를 올려 만듭니다.
        </p>
      </div>

      <WastewaterLogPanel manifests={manifests} years={years} summary={wastewaterSummary} />

      <WaterManagement summary={summary} initialFacilitySpecs={facilitySpecs} />
    </main>
  );
}
