import { NextResponse } from "next/server";
import { readAttachment } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const file = await readAttachment(path);
  if (!file) return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: { "Content-Type": file.contentType, "Cache-Control": "no-store", "Content-Disposition": "inline" },
  });
}
