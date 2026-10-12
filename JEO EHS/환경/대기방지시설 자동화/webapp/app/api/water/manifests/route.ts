import { NextResponse } from "next/server";
import { loadManifests, mergeManifests, parseManifestWorkbook, saveManifests } from "@/lib/water/manifests";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 위탁인계서 목록(.xls/.xlsx) 업로드 — 기존 목록에 합쳐 저장한다(수탁처리확인서번호가 같으면 갱신). */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "엑셀 파일이 필요합니다." }, { status: 400 });
  }
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
    return NextResponse.json({ error: ".xls 또는 .xlsx 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  try {
    const { manifests, skipped } = parseManifestWorkbook(Buffer.from(await file.arrayBuffer()));
    const existing = await loadManifests();
    const { merged, added } = mergeManifests(existing, manifests);
    await saveManifests(merged);
    return NextResponse.json({ ok: true, parsed: manifests.length, added, total: merged.length, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "파일을 분석하지 못했습니다.";
    console.error(`[water/manifests] parse failed: file=${file.name} message=${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** 인계 1건 삭제 — body: { serialNo } */
export async function DELETE(request: Request) {
  const { serialNo } = (await request.json()) as { serialNo?: string };
  if (!serialNo) return NextResponse.json({ error: "serialNo가 필요합니다." }, { status: 400 });
  const existing = await loadManifests();
  await saveManifests(existing.filter((m) => m.serialNo !== serialNo));
  return NextResponse.json({ ok: true });
}
