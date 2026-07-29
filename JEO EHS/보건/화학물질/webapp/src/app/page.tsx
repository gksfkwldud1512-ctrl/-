import Link from "next/link";
import { listMixtures, getHazardousIngredientNamesByMixture } from "@/lib/db/repo";
import { UploadForm } from "@/components/UploadForm";
import { DeleteMixtureButton } from "@/components/DeleteMixtureButton";
import { OVERALL_VERDICT_COLOR, OVERALL_VERDICT_LABEL, MATERIAL_TYPE_LABEL } from "@/lib/format";
import type { MaterialType } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Mixture = Awaited<ReturnType<typeof listMixtures>>[number];

function MixtureTable({
  mixtures,
  hazardousNames,
}: {
  mixtures: Mixture[];
  hazardousNames: Map<string, string[]>;
}) {
  if (mixtures.length === 0) {
    return <p className="px-1 py-6 text-sm text-zinc-400">등록된 항목이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full min-w-[840px] text-sm table-fixed">
        <thead className="bg-zinc-50 text-left text-zinc-500">
          <tr>
            <th className="w-10 px-3 py-3 font-medium">#</th>
            <th className="w-[26%] px-3 py-3 font-medium">화학물질명</th>
            <th className="w-[20%] px-3 py-3 font-medium">제조사</th>
            <th className="w-[28%] px-3 py-3 font-medium">유해화학물질여부</th>
            <th className="w-24 px-3 py-3 font-medium">세부물질</th>
            <th className="w-14 px-3 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {mixtures.map((m, idx) => {
            const detailHref = m.status === "confirmed" ? `/mixtures/${m.id}` : `/mixtures/${m.id}/review`;
            const names = hazardousNames.get(m.id) ?? [];
            return (
              <tr key={m.id} className="hover:bg-zinc-50">
                <td className="px-3 py-3 text-zinc-400">{idx + 1}</td>
                <td className="px-3 py-3">
                  <Link href={detailHref} className="font-medium text-zinc-900 hover:underline truncate block" title={m.productName}>
                    {m.productName}
                  </Link>
                </td>
                <td className="px-3 py-3 text-zinc-600 truncate" title={m.manufacturer ?? undefined}>
                  {m.manufacturer ?? "-"}
                </td>
                <td className="px-3 py-3">
                  {m.status === "pending_review" ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500">
                      검토 대기
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span
                        className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${OVERALL_VERDICT_COLOR[m.overallVerdict ?? "not_hazardous"]}`}
                      >
                        {OVERALL_VERDICT_LABEL[m.overallVerdict ?? "not_hazardous"]}
                      </span>
                      {names.length > 0 && (
                        <span className="text-xs text-red-700 truncate" title={names.join(", ")}>
                          해당 물질: {names.join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={detailHref}
                    className="inline-block whitespace-nowrap rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    상세보기
                  </Link>
                </td>
                <td className="px-3 py-3 text-right">
                  <DeleteMixtureButton mixtureId={m.id} productName={m.productName} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function Home() {
  const mixtures = await listMixtures();
  const hazardousMixtureIds = mixtures
    .filter((m) => m.status === "confirmed" && m.overallVerdict === "hazardous")
    .map((m) => m.id);
  const hazardousNames = await getHazardousIngredientNamesByMixture(hazardousMixtureIds);

  const grouped: Record<MaterialType, Mixture[]> = { raw: [], auxiliary: [] };
  for (const m of mixtures) grouped[m.materialType].push(m);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">화학물질 유해성 관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          혼합물 MSDS를 업로드하면 구성성분의 CAS번호를 유해화학물질 기준 데이터와 대조합니다.
        </p>
      </div>

      <UploadForm />

      {(["raw", "auxiliary"] as const).map((type) => (
        <section key={type} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-zinc-800">
            {MATERIAL_TYPE_LABEL[type]}{" "}
            <span className="text-sm font-normal text-zinc-400">({grouped[type].length}건)</span>
          </h2>
          <MixtureTable mixtures={grouped[type]} hazardousNames={hazardousNames} />
        </section>
      ))}
    </main>
  );
}
