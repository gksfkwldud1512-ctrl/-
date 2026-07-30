import { NextResponse } from "next/server";
import { put, get } from "@vercel/blob";

// 증빙 파일은 비공개(private) 스토어에 저장한다 — 계정 스토어가 public access를 지원하지 않고,
// 애초에 증빙자료는 외부 공개용이 아니므로 항상 서버를 거쳐서만 읽는다.
const PREFIX = "compliance/evidence";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const categoryId = formData.get("categoryId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
  }
  if (typeof categoryId !== "string" || !categoryId) {
    return NextResponse.json({ error: "categoryId가 필요합니다." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const blob = await put(`${PREFIX}/${categoryId}/${file.name}`, buffer, {
    access: "private",
    addRandomSuffix: true, // 같은 이름 파일을 여러 번 올려도 서로 덮어쓰지 않게.
    contentType: file.type || "application/octet-stream",
  });

  return NextResponse.json({
    name: file.name,
    url: blob.pathname, // 실제 다운로드는 GET ?path=pathname으로만 가능(비공개 스토어).
    uploadedAt: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path || !path.startsWith(PREFIX)) {
    return NextResponse.json({ error: "잘못된 경로입니다." }, { status: 400 });
  }

  const result = await get(path, { access: "private", useCache: false });
  if (!result || !result.stream) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
  const contentType = result.headers.get("content-type") || "application/octet-stream";
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Content-Disposition": "inline",
    },
  });
}
