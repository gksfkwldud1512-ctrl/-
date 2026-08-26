import { loadKpiSummary } from "@/lib/kpi/store";
import { WaterManagement } from "@/components/WaterManagement";

export const dynamic = "force-dynamic";

export default async function WaterPage() {
  const summary = await loadKpiSummary();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <a href="/kpi" className="text-sm text-zinc-500 hover:underline">
          ← 안전환경 KPI
        </a>
        <h1 className="mt-2 text-2xl font-semibold">용수관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          안전환경 KPI에서 업로드한 DETAILS 파일의 용수 취수·배출 데이터를 시설배치도와 월별 표로 보여줍니다.
          별도 업로드는 필요 없습니다.
        </p>
      </div>

      <WaterManagement summary={summary} />
    </main>
  );
}
