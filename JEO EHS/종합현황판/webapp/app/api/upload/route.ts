import { NextResponse } from "next/server";
import { saveAttachment } from "@/lib/store";

export const maxDuration = 60;

/** 완료 기록 첨부 파일 업로드 (최대 10MB) */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "10MB 이하 파일만 올릴 수 있습니다." }, { status: 400 });
  const path = await saveAttachment(file.name, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
  return NextResponse.json({ name: file.name, path });
}
