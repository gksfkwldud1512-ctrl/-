import { desc, eq } from "drizzle-orm";
import { db } from "./client";
import { placementExams, type HazardGrade } from "./schema";
import { maskResidentNumber } from "@/lib/parsing/placementExam";

export type PlacementExamInput = {
  name: string;
  age: number | null;
  gender: string | null;
  residentNumberMasked: string | null;
  department: string | null;
  workProcess: string | null;
  examDate: string | null;
  nextExamDate: string | null;
  hazardGrades: HazardGrade[];
  healthGradeWorst: string | null;
  opinionText: string | null;
};

export async function listPlacementExams() {
  return db.select().from(placementExams).orderBy(desc(placementExams.uploadedAt));
}

export async function getPlacementExam(id: string) {
  const [row] = await db.select().from(placementExams).where(eq(placementExams.id, id));
  return row ?? null;
}

export async function createDraftPlacementExam(input: {
  pdfBlobUrl: string;
  pdfFilename: string;
  draft: PlacementExamInput;
}) {
  const [row] = await db
    .insert(placementExams)
    .values({
      name: input.draft.name || "(미확인)",
      age: input.draft.age,
      gender: input.draft.gender,
      residentNumberMasked: maskResidentNumber(input.draft.residentNumberMasked),
      department: input.draft.department,
      workProcess: input.draft.workProcess,
      examDate: input.draft.examDate,
      nextExamDate: input.draft.nextExamDate,
      hazardGrades: input.draft.hazardGrades,
      healthGradeWorst: input.draft.healthGradeWorst,
      opinionText: input.draft.opinionText,
      pdfBlobUrl: input.pdfBlobUrl,
      pdfFilename: input.pdfFilename,
      status: "pending_review",
    })
    .returning();
  return row;
}

export async function updatePlacementExam(id: string, patch: PlacementExamInput) {
  await db
    .update(placementExams)
    .set({
      name: patch.name || "(미확인)",
      age: patch.age,
      gender: patch.gender,
      residentNumberMasked: maskResidentNumber(patch.residentNumberMasked),
      department: patch.department,
      workProcess: patch.workProcess,
      examDate: patch.examDate,
      nextExamDate: patch.nextExamDate,
      hazardGrades: patch.hazardGrades,
      healthGradeWorst: patch.healthGradeWorst,
      opinionText: patch.opinionText,
    })
    .where(eq(placementExams.id, id));
}

export async function confirmPlacementExam(id: string) {
  await db
    .update(placementExams)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(placementExams.id, id));
}
