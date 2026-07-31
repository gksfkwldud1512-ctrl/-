import { NextResponse } from "next/server";
import { loadMeetingData, type MeetingData } from "@/lib/meetingData";
import { buildMeetingPptx } from "@/lib/pptBuilder";

export const maxDuration = 60;

export async function POST(request: Request) {
  // 저장된 초안이 아니라, 화면에서 방금 번역까지 마친 최신 데이터를 그대로 받아서 PPT를 만든다.
  const body = (await request.json().catch(() => null)) as MeetingData | null;
  const data = body ?? (await loadMeetingData());

  const buffer = await buildMeetingPptx(data);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
  const filename = `EHS_Weekly_Meeting_${stamp}.pptx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "Content-Length": String(buffer.length),
    },
  });
}
