import { NextResponse } from "next/server";
import { loadLibraryIndex, deleteFromLibrary } from "@/lib/library";

export async function GET() {
  const index = await loadLibraryIndex();
  return NextResponse.json(index);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  await deleteFromLibrary(id);
  return NextResponse.json({ ok: true });
}
