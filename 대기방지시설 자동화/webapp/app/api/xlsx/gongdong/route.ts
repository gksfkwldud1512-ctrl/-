import { NextRequest, NextResponse } from "next/server";
import { computeGongdongRows, type Calendar } from "@/lib/calc";
import { buildGongdongWorkbook } from "@/lib/xlsx";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const year: number = body.year;
  const month: number = body.month;
  const calendar: Calendar = body.calendar ?? {};

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "invalid year/month" }, { status: 400 });
  }

  const rows = computeGongdongRows(year, month, calendar);
  const wb = await buildGongdongWorkbook(year, rows);
  const buffer = await wb.xlsx.writeBuffer();

  const filename = encodeURIComponent(`배출구가동시간목록양식_${year}년_${month}월.xlsx`);
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
