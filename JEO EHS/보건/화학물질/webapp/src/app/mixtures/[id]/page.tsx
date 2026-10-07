import { notFound } from "next/navigation";
import Link from "next/link";
import { getMixtureWithIngredients, getReferencesByIds } from "@/lib/db/repo";
import {
  MATCH_STATUS_COLOR,
  MATCH_STATUS_LABEL,
  OVERALL_VERDICT_COLOR,
  OVERALL_VERDICT_LABEL,
  MATERIAL_TYPE_LABEL,
  REVIEW_STATUS_COLOR,
  REVIEW_STATUS_LABEL,
  formatDate,
  formatThreshold,
} from "@/lib/format";
import { computeReviewStatus } from "@/lib/msds/reviewStatus";
import { INDUSTRIAL_SAFETY_ACT_CATEGORIES } from "@/lib/law/categories";

export const dynamic = "force-dynamic";

export default async function MixtureDetailPage(props: PageProps<"/mixtures/[id]">) {
  const { id } = await props.params;
  const result = await getMixtureWithIngredients(id);
  if (!result) notFound();
  const { mixture, ingredients } = result;

  const refIds = Array.from(
    new Set(ingredients.map((i) => i.matchedReferenceId).filter((v): v is string => !!v))
  );
  const refs = await getReferencesByIds(refIds);
  const refMap = new Map(refs.map((r) => [r.id, r]));
  const reviewStatus = computeReviewStatus(mixture.revisionDate, mixture.reviewCycleYears);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← 목록으로
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{mixture.productName}</h1>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-600">
            {MATERIAL_TYPE_LABEL[mixture.materialType]}
          </span>
          {mixture.status === "confirmed" && mixture.overallVerdict && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${OVERALL_VERDICT_COLOR[mixture.overallVerdict]}`}
            >
              {OVERALL_VERDICT_LABEL[mixture.overallVerdict]}
            </span>
          )}
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${REVIEW_STATUS_COLOR[reviewStatus]}`}>
            개정주기: {REVIEW_STATUS_LABEL[reviewStatus]}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          제조사: {mixture.manufacturer ?? "미확인"} · 부서: {mixture.department ?? "미지정"}
          {mixture.materialType === "auxiliary" && ` · 공정: ${mixture.workProcess ?? "미지정"}`}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          업로드: {formatDate(mixture.uploadedAt)}
          {mixture.confirmedAt && ` · 확정: ${formatDate(mixture.confirmedAt)}`}
          {mixture.revisionDate && ` · MSDS 개정일: ${mixture.revisionDate}`}
          {mixture.reviewCycleYears && ` (재검토주기 ${mixture.reviewCycleYears}년)`}
        </p>
        {reviewStatus === "red" && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            재검토 기한이 지났습니다 — 공급업체에 신규 MSDS를 요청해야 합니다.
          </p>
        )}
        <a
          href={mixture.pdfBlobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-zinc-700 underline"
        >
          원본 MSDS PDF 다운로드 ({mixture.pdfFilename})
        </a>
      </div>

      {mixture.status === "pending_review" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          아직 검토가 완료되지 않았습니다.{" "}
          <Link href={`/mixtures/${mixture.id}/review`} className="font-medium underline">
            검토 화면에서 확인 및 저장을 진행해 주세요.
          </Link>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">화학물질명</th>
              <th className="px-3 py-2 font-medium">CAS번호</th>
              <th className="px-3 py-2 font-medium">함유량(%)</th>
              <th className="px-3 py-2 font-medium">화관법 유해물질</th>
              {INDUSTRIAL_SAFETY_ACT_CATEGORIES.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">
                  {c.label.replace(" 대상 유해인자", "")}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">적용 기준함량</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {ingredients.map((ing) => {
              const ref = ing.matchedReferenceId ? refMap.get(ing.matchedReferenceId) : undefined;
              return (
                <tr key={ing.id}>
                  <td className="px-3 py-2">
                    {ing.ingredientName}
                    {ref?.nameKr && ref.nameKr !== ing.ingredientName && (
                      <div className="text-xs text-zinc-400">기준물질명: {ref.nameKr}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">{ing.casNo ?? "-"}</td>
                  <td className="px-3 py-2">{ing.contentPercentRaw ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${MATCH_STATUS_COLOR[ing.matchStatus]}`}
                    >
                      {MATCH_STATUS_LABEL[ing.matchStatus]}
                    </span>
                  </td>
                  {INDUSTRIAL_SAFETY_ACT_CATEGORIES.map((c) => {
                    const v = ing.categoryVerdicts.find((cv) => cv.category === c.key);
                    return (
                      <td key={c.key} className="px-3 py-2 text-center">
                        {v ? (
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                              v.matched ? "bg-red-100 text-red-800" : "bg-zinc-100 text-zinc-400"
                            }`}
                            title={v.threshold ? formatThreshold(v.threshold) : undefined}
                          >
                            {v.matched ? "O" : "X"}
                          </span>
                        ) : (
                          <span className="text-zinc-300">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {ing.appliedThresholds.length > 0 ? (
                      <ul className="list-inside list-disc">
                        {ing.appliedThresholds.map((t, idx) => (
                          <li key={idx}>{formatThreshold(t)}</li>
                        ))}
                      </ul>
                    ) : ing.matchStatus === "matched_hazardous" ? (
                      <span>CAS 일치 (기준함량 없음 — 매칭만으로 해당)</span>
                    ) : ref?.thresholdRaw ? (
                      <span className="text-zinc-400">{ref.thresholdRaw}</span>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mixture.ppeText && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-700">보호구(MSDS 8장 발췌)</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600">{mixture.ppeText}</p>
        </div>
      )}
    </main>
  );
}
