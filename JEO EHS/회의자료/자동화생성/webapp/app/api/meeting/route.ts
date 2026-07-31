import { NextResponse } from "next/server";
import { loadMeetingData, saveMeetingData } from "@/lib/meetingData";

export async function GET() {
  const data = await loadMeetingData();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const saved = await saveMeetingData(body);
  return NextResponse.json(saved);
}
