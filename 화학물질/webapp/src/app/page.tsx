import Link from "next/link";
import { listMixtures } from "@/lib/db/repo";
import { UploadForm } from "@/components/UploadForm";
import { OVERALL_VERDICT_COLOR, OVERALL_VERDICT_LABEL, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const mixtures = await listMixtures();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">화학물질 유해성 관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          혼합물 MSDS를 업로드하면 구성성분의 CAS번호를 유해화학물질 기준 데이터와 대조합니다.
        </p>
      </div>

      <UploadForm />

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">제품명</th>
              <th className="px-4 py-3 font-medium">업로드일</th>
              <th className="px-4 py-3 font-medium">판정</th>
              <th className="px-4 py-3 font-medium">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {mixtures.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                  업로드된 혼합물이 없습니다.
                </td>
              </tr>
            )}
            {mixtures.map((m) => (
              <tr key={m.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <Link
                    href={m.status === "confirmed" ? `/mixtures/${m.id}` : `/mixtures/${m.id}/review`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {m.productName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(m.uploadedAt)}</td>
                <td className="px-4 py-3">
                  {m.status === "pending_review" ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500">
                      검토 대기
                    </span>
                  ) : (
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${OVERALL_VERDICT_COLOR[m.overallVerdict ?? "not_hazardous"]}`}
                    >
                      {OVERALL_VERDICT_LABEL[m.overallVerdict ?? "not_hazardous"]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={m.pdfBlobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-500 hover:text-zinc-900 hover:underline"
                  >
                    다운로드
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
