import Link from "next/link";
import {
  listMixtures,
  getHazardousIngredientNamesByMixture,
  getCategoryFlagsByMixture,
  getDepartmentPositionOptions,
} from "@/lib/db/repo";
import { UploadForm } from "@/components/UploadForm";
import { DeleteMixtureButton } from "@/components/DeleteMixtureButton";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import {
  OVERALL_VERDICT_COLOR,
  OVERALL_VERDICT_SHORT_LABEL,
  MATERIAL_TYPE_LABEL,
} from "@/lib/format";
import { RevisionStatusBadge } from "@/components/RevisionStatusBadge";
import { computeReviewStatus, isManuallyChecked } from "@/lib/msds/reviewStatus";
import { INDUSTRIAL_SAFETY_ACT_CATEGORIES } from "@/lib/law/categories";
import type { MaterialType } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Mixture = Awaited<ReturnType<typeof listMixtures>>[number];

function MixtureTable({
  mixtures,
  hazardousNames,
  categoryFlags,
}: {
  mixtures: Mixture[];
  hazardousNames: Map<string, string[]>;
  categoryFlags: Map<string, Set<string>>;
}) {
  if (mixtures.length === 0) {
    return <p className="px-1 py-6 text-sm text-zinc-400">등록된 항목이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full min-w-[1200px] text-sm">
        <thead className="bg-zinc-50 text-left text-zinc-500">
          <tr>
            <th className="whitespace-nowrap px-3 py-3 font-medium">#</th>
            <th className="whitespace-nowrap px-3 py-3 font-medium">화학물질명</th>
            <th className="whitespace-nowrap px-3 py-3 font-medium">부서/공정</th>
            <th className="whitespace-nowrap px-3 py-3 font-medium">화관법 유해물질</th>
            <th className="whitespace-nowrap px-3 py-3 font-medium">산안법 해당</th>
            <th className="whitespace-nowrap px-3 py-3 font-medium">개정확인여부</th>
            <th className="whitespace-nowrap px-3 py-3 font-medium">세부물질</th>
            <th className="whitespace-nowrap px-3 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {mixtures.map((m, idx) => {
            const detailHref = m.status === "confirmed" ? `/mixtures/${m.id}` : `/mixtures/${m.id}/review`;
            const names = hazardousNames.get(m.id) ?? [];
            const flags = categoryFlags.get(m.id) ?? new Set<string>();
            const reviewStatus = computeReviewStatus(m.revisionDate, m.revisionCheckedFor);
            return (
              <tr key={m.id} className="hover:bg-zinc-50">
                <td className="px-3 py-3 text-zinc-400">{idx + 1}</td>
                <td className="max-w-[220px] px-3 py-3">
                  <Link href={detailHref} className="block truncate font-medium text-zinc-900 hover:underline" title={m.productName}>
                    {m.productName}
                  </Link>
                  <div className="truncate text-xs text-zinc-400" title={m.manufacturer ?? undefined}>
                    {m.manufacturer ?? "-"}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-600">
                  <div>{m.department ?? "-"}</div>
                  <div className="text-zinc-400">{m.materialType === "raw" ? "-" : (m.workProcess ?? "-")}</div>
                </td>
                <td className="px-3 py-3">
                  {m.status === "pending_review" ? (
                    <span className="whitespace-nowrap rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500">
                      검토 대기
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {/* 화관법 유해화학물질 기준(성분별 함유량 기준 초과)만 반영한다. 산안법 해당 여부는 옆 칸 */}
                      <span
                        className={`w-fit whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${
                          names.length > 0 ? OVERALL_VERDICT_COLOR.hazardous : OVERALL_VERDICT_COLOR.not_hazardous
                        }`}
                      >
                        {names.length > 0 ? OVERALL_VERDICT_SHORT_LABEL.hazardous : OVERALL_VERDICT_SHORT_LABEL.not_hazardous}
                      </span>
                      {names.length > 0 && (
                        <span className="max-w-[220px] truncate text-xs text-red-700" title={names.join(", ")}>
                          {names.join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {m.status === "confirmed" ? (
                    <div className="flex flex-wrap gap-1">
                      {INDUSTRIAL_SAFETY_ACT_CATEGORIES.map((c) => (
                        <span
                          key={c.key}
                          className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            flags.has(c.key) ? "bg-red-100 text-red-800" : "bg-zinc-100 text-zinc-400"
                          }`}
                        >
                          {c.label.replace(" 대상 유해인자", "")} {flags.has(c.key) ? "O" : "X"}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400">-</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <RevisionStatusBadge
                    mixtureId={m.id}
                    status={reviewStatus}
                    manuallyChecked={isManuallyChecked(m.revisionDate, m.revisionCheckedFor)}
                  />
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
  const confirmedMixtureIds = mixtures.filter((m) => m.status === "confirmed").map((m) => m.id);
  const hazardousMixtureIds = confirmedMixtureIds;
  const [hazardousNames, categoryFlags, { departments, positionsByDepartment }] = await Promise.all([
    getHazardousIngredientNamesByMixture(hazardousMixtureIds),
    getCategoryFlagsByMixture(confirmedMixtureIds),
    getDepartmentPositionOptions(),
  ]);

  const grouped: Record<MaterialType, Mixture[]> = { raw: [], auxiliary: [] };
  for (const m of mixtures) grouped[m.materialType].push(m);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">화학물질 유해성 관리</h1>
          <p className="mt-1 text-sm text-zinc-500">
            혼합물 MSDS를 업로드하면 구성성분의 CAS번호를 화학물질관리법·산업안전보건법 기준
            데이터와 대조합니다.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/employees"
            className="h-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            임직원 명부 관리
          </Link>
          <Link
            href="/dashboard"
            className="h-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            부서·법령별 대시보드 →
          </Link>
        </div>
      </div>

      <UploadForm departments={departments} positionsByDepartment={positionsByDepartment} />

      {(["raw", "auxiliary"] as const).map((type) => (
        <CollapsibleSection key={type} title={MATERIAL_TYPE_LABEL[type]} count={grouped[type].length}>
          <MixtureTable mixtures={grouped[type]} hazardousNames={hazardousNames} categoryFlags={categoryFlags} />
        </CollapsibleSection>
      ))}
    </main>
  );
}
