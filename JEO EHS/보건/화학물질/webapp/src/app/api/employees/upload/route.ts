import { NextResponse } from "next/server";
import { parseEmployeesWorkbook, replaceEmployees } from "@/lib/seed/seedEmployees";

export const maxDuration = 60;

/** 사원명부 xlsx를 업로드해 employees 테이블을 통째로 교체한다(신규입사자/인원변경 반영). */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "xlsx 파일이 필요합니다." }, { status: 400 });
  }
  const isXlsx =
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (!isXlsx) {
    return NextResponse.json({ error: "xlsx 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const { records, totalRows, skipped } = await parseEmployeesWorkbook(buffer);
    if (records.length === 0) {
      return NextResponse.json(
        { error: "파싱된 사원 정보가 없습니다. '사원명 | 사번 | 부서명 | 포지션 | 입사일' 형식(1행 제목, 2행 헤더)인지 확인해 주세요." },
        { status: 400 }
      );
    }
    await replaceEmployees(records);
    return NextResponse.json({ ok: true, totalRows, skipped, inserted: records.length });
  } catch (err) {
    console.error("사원명부 업로드 처리 실패:", err);
    return NextResponse.json({ error: "파일을 읽을 수 없습니다. xlsx 형식을 확인해 주세요." }, { status: 400 });
  }
}
