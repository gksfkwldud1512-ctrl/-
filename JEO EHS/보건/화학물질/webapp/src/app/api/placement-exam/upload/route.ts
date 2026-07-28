import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { parsePlacementExam } from "@/lib/parsing/placementExam";
import { createDraftPlacementExam } from "@/lib/db/repoPlacementExam";

export const maxDuration = 60;

async function uploadPdfToBlob(filename: string, buffer: Buffer): Promise<string> {
  const safeName = filename.replace(/[^\w.\-가-힣]/g, "_");
  const blob = await put(`placement-exam/${Date.now()}-${safeName}`, buffer, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: true,
  });
  return blob.url;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "PDF 파일이 필요합니다." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const pdfBlobUrl = await uploadPdfToBlob(file.name, buffer);

  let draft;
  try {
    draft = await parsePlacementExam(buffer);
  } catch (err) {
    console.error("배치전검진 PDF 파싱 실패, 빈 초안으로 진행:", err);
    draft = {
      name: null,
      age: null,
      gender: null,
      residentNumberMasked: null,
      department: null,
      workProcess: null,
      examDate: null,
      nextExamDate: null,
      hazardGrades: [],
      healthGradeWorst: null,
      opinionText: null,
    };
  }

  const row = await createDraftPlacementExam({
    pdfBlobUrl,
    pdfFilename: file.name,
    draft: { ...draft, name: draft.name ?? file.name.replace(/\.pdf$/i, "") },
  });

  return NextResponse.json({ id: row.id });
}
