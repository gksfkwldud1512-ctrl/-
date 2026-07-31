import { NextResponse } from "next/server";
import { uploadToLibrary } from "@/lib/library";

export const maxDuration = 30;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const label = formData.get("label");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pptx")) {
    return NextResponse.json({ error: ".pptx 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const entry = await uploadToLibrary(file.name, typeof label === "string" && label.trim() ? label.trim() : file.name, buffer);
  return NextResponse.json(entry);
}
