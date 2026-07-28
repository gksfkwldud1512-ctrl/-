import { notFound } from "next/navigation";
import Link from "next/link";
import { getPlacementExam } from "@/lib/db/repoPlacementExam";
import { PlacementExamReviewForm } from "@/components/PlacementExamReviewForm";

export const dynamic = "force-dynamic";

export default async function PlacementExamReviewPage(
  props: PageProps<"/placement-exam/[id]/review">
) {
  const { id } = await props.params;
  const exam = await getPlacementExam(id);
  if (!exam) notFound();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/placement-exam" className="text-sm text-zinc-500 hover:underline">
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">배치전검진 검토: {exam.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">파일명: {exam.pdfFilename}</p>
      </div>

      <PlacementExamReviewForm
        examId={exam.id}
        initial={{
          name: exam.name,
          age: exam.age,
          gender: exam.gender,
          residentNumberMasked: exam.residentNumberMasked,
          department: exam.department,
          workProcess: exam.workProcess,
          examDate: exam.examDate,
          nextExamDate: exam.nextExamDate,
          hazardGrades: exam.hazardGrades,
          healthGradeWorst: exam.healthGradeWorst,
          opinionText: exam.opinionText,
        }}
      />
    </main>
  );
}
