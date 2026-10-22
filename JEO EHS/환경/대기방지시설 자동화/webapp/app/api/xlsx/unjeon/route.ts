import { NextRequest, NextResponse } from "next/server";
import { recordAirDownload } from "@/lib/airRecords";
import { computeUnjeonRows, type Calendar, type MeterReadings } from "@/lib/calc";
import { buildUnjeonWorkbook } from "@/lib/xlsx";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const year: number = body.year;
  const month: number = body.month;
  const calendar: Calendar = body.calendar ?? {};
  const meterReadings: MeterReadings = body.meterReadings ?? {};

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "invalid year/month" }, { status: 400 });
  }

  const rows = computeUnjeonRows(year, month, calendar, meterReadings);
  const wb = await buildUnjeonWorkbook(year, rows);
  const buffer = await wb.xlsx.writeBuffer();

  // 종합업무현황판이 월별 작성 여부를 알 수 있도록 다운로드 기록을 남긴다(실패해도 다운로드는 계속).
  await recordAirDownload("unjeon", year, month);

  const filename = encodeURIComponent(`시설운전사항목록양식_${year}년_${month}월.xlsx`);
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
