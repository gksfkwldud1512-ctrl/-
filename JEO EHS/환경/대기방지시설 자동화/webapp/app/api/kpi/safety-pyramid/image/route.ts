import { NextResponse } from "next/server";
import { saveSafetyPyramidImage, getSafetyPyramidImageBuffer } from "@/lib/kpi/safetyPyramid";

export async function GET() {
  const image = await getSafetyPyramidImageBuffer();
  if (!image) {
    return NextResponse.json({ error: "업로드된 이미지가 없습니다." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(image.buffer), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "이미지 파일이 필요합니다." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "이미지 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveSafetyPyramidImage(buffer, file.type);
  return NextResponse.json(saved);
}
