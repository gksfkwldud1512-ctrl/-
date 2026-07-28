import { notFound } from "next/navigation";
import Link from "next/link";
import { getPlacementExam } from "@/lib/db/repoPlacementExam";
import { gradeLabel, gradeColor } from "@/lib/placementExamFormat";

export const dynamic = "force-dynamic";

export default async function PlacementExamDetailPage(
  props: PageProps<"/placement-exam/[id]">
) {
  const { id } = await props.params;
  const exam = await getPlacementExam(id);
  if (!exam) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/placement-exam" className="text-sm text-zinc-500 hover:underline">
          ← 목록으로
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{exam.name}</h1>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${gradeColor(exam.healthGradeWorst)}`}>
            {gradeLabel(exam.healthGradeWorst)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-zinc-200 bg-white p-5 sm:grid-cols-2">
        <InfoRow label="나이" value={exam.age?.toString() ?? "-"} />
        <InfoRow label="성별" value={exam.gender ?? "-"} />
        <InfoRow label="주민등록번호" value={exam.residentNumberMasked ?? "-"} mono />
        <InfoRow label="부서" value={exam.department ?? "-"} />
        <InfoRow label="작업공정" value={exam.workProcess ?? "-"} />
        <InfoRow label="배치전검진일" value={exam.examDate ?? "-"} />
        <InfoRow label="배치후 검진만료(차기 예정일)" value={exam.nextExamDate ?? "-"} />
        <InfoRow
          label="PDF 원본"
          value={
            <a
              href={exam.pdfBlobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-700 underline hover:text-zinc-900"
            >
              다운로드
            </a>
          }
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700">유해인자별 건강구분</p>
        <div className="flex flex-wrap gap-2">
          {exam.hazardGrades.length === 0 && <p className="text-sm text-zinc-400">등록된 항목이 없습니다.</p>}
          {exam.hazardGrades.map((h, idx) => (
            <span
              key={idx}
              className={`rounded-full px-3 py-1 text-xs font-medium ${gradeColor(h.grade)}`}
              title={h.hazard}
            >
              {h.hazard} · {h.grade}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700">검진소견 상세</p>
        <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-700">
          {exam.opinionText || "등록된 소견이 없습니다."}
        </div>
      </div>

      <Link
        href={`/placement-exam/${exam.id}/review`}
        className="w-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
      >
        수정하기
      </Link>
    </main>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={`text-sm text-zinc-800 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
