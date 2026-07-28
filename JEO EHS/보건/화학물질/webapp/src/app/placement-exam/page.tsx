import Link from "next/link";
import { listPlacementExams } from "@/lib/db/repoPlacementExam";
import { PlacementExamUploadForm } from "@/components/PlacementExamUploadForm";
import { gradeLabel, gradeColor } from "@/lib/placementExamFormat";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function PlacementExamListPage() {
  const exams = await listPlacementExams();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">배치전검진 목록</h1>
          <p className="mt-1 text-sm text-zinc-500">
            배치전검진 결과 PDF를 업로드하면 성명·주민번호(마스킹)·부서·검진일·건강구분을 자동으로 정리합니다.
          </p>
        </div>
        <LogoutButton />
      </div>

      <PlacementExamUploadForm />

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">성함</th>
              <th className="px-4 py-3 font-medium">나이</th>
              <th className="px-4 py-3 font-medium">주민번호</th>
              <th className="px-4 py-3 font-medium">부서</th>
              <th className="px-4 py-3 font-medium">배치전검진일</th>
              <th className="px-4 py-3 font-medium">배치후 검진만료</th>
              <th className="px-4 py-3 font-medium">건강구분</th>
              <th className="px-4 py-3 font-medium">소견서</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {exams.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                  업로드된 검진 결과가 없습니다.
                </td>
              </tr>
            )}
            {exams.map((exam) => {
              const detailHref =
                exam.status === "confirmed"
                  ? `/placement-exam/${exam.id}`
                  : `/placement-exam/${exam.id}/review`;
              return (
                <tr key={exam.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={detailHref} className="font-medium text-zinc-900 hover:underline">
                      {exam.name}
                    </Link>
                    {exam.status === "pending_review" && (
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                        검토 대기
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{exam.age ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-zinc-600">
                    {exam.residentNumberMasked ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{exam.department ?? "-"}</td>
                  <td className="px-4 py-3 text-zinc-600">{exam.examDate ?? "-"}</td>
                  <td className="px-4 py-3 text-zinc-600">{exam.nextExamDate ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${gradeColor(exam.healthGradeWorst)}`}
                    >
                      {gradeLabel(exam.healthGradeWorst)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={detailHref} className="text-zinc-500 hover:text-zinc-900 hover:underline">
                      상세보기
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
