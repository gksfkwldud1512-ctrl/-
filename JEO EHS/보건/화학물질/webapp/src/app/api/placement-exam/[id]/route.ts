import { NextResponse } from "next/server";
import { updatePlacementExam } from "@/lib/db/repoPlacementExam";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const body = await request.json();

  await updatePlacementExam(id, {
    name: body.name ?? "",
    age: body.age === "" || body.age === null || body.age === undefined ? null : Number(body.age),
    gender: body.gender || null,
    residentNumberMasked: body.residentNumberMasked || null,
    department: body.department || null,
    workProcess: body.workProcess || null,
    examDate: body.examDate || null,
    nextExamDate: body.nextExamDate || null,
    hazardGrades: Array.isArray(body.hazardGrades) ? body.hazardGrades : [],
    healthGradeWorst: body.healthGradeWorst || null,
    opinionText: body.opinionText || null,
  });

  return NextResponse.json({ ok: true });
}
