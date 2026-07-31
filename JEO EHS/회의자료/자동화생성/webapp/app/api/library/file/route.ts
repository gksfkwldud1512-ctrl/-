import { NextResponse } from "next/server";
import { getLibraryFile } from "@/lib/library";

const PREFIX = "meeting/library/files/";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path || !path.startsWith(PREFIX)) {
    return NextResponse.json({ error: "잘못된 경로입니다." }, { status: 400 });
  }
  const file = await getLibraryFile(path);
  if (!file) return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.split("/").pop() || "file.pptx")}`,
    },
  });
}
