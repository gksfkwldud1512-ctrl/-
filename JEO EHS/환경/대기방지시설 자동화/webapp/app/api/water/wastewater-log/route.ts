import { NextResponse } from "next/server";
import { loadManifests } from "@/lib/water/manifests";
import { buildWastewaterPlan } from "@/lib/water/wastewaterPlan";
import { buildWastewaterWorkbook } from "@/lib/water/wastewaterXlsx";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 저장된 위탁인계 내역으로 폐수배출시설 운영일지(xlsx, 27일/쪽)를 만들어 내려준다. ?year=2026 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  const manifests = await loadManifests();
  const plan = buildWastewaterPlan(manifests, year);
  if (plan.days.length === 0) {
    return NextResponse.json({ error: `${year}년 위탁인계 내역이 없습니다. 위탁인계서를 먼저 업로드해 주세요.` }, { status: 404 });
  }

  const buffer = await buildWastewaterWorkbook(plan);
  const fileName = `폐수배출시설운영일지_${year}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
