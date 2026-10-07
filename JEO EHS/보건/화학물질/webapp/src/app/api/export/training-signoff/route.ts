import ExcelJS from "exceljs";
import { getDashboardData, getEmployeesForScope } from "@/lib/db/repo";
import { COMMON_DEPARTMENT } from "@/lib/constants";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 부서(+공정) 소속 직원 전원 × 취급물질 목록으로, 서명만 받으면 되는 교육 서명지를 생성한다. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department");
  const workProcess = searchParams.get("workProcess");
  if (!department) {
    return new Response(JSON.stringify({ error: "department 파라미터가 필요합니다." }), { status: 400 });
  }

  const [allRows, employeeList] = await Promise.all([
    getDashboardData(),
    getEmployeesForScope(department, workProcess || null),
  ]);

  const scopedRows = allRows.filter(
    (r) => r.department === department && (department === COMMON_DEPARTMENT || !workProcess || r.workProcess === workProcess)
  );
  const productNames = Array.from(new Set(scopedRows.map((r) => r.productName))).sort((a, b) =>
    a.localeCompare(b, "ko")
  );
  const substancesText = productNames.join(", ") || "(해당 물질 없음)";

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("교육서명지");
  sheet.columns = [
    { header: "No", key: "no", width: 5 },
    { header: "부서", key: "department", width: 14 },
    { header: "공정(포지션)", key: "position", width: 16 },
    { header: "사번", key: "employeeNo", width: 12 },
    { header: "성명", key: "name", width: 12 },
    { header: "교육대상물질", key: "substances", width: 50 },
    { header: "교육일자", key: "trainedAt", width: 14 },
    { header: "서명", key: "signature", width: 14 },
  ];

  if (employeeList.length === 0) {
    sheet.addRow({ no: "", department, position: workProcess ?? "", name: "(해당 부서·공정 소속 직원 없음 — 임직원 명부를 확인해 주세요)" });
  }

  employeeList.forEach((emp, idx) => {
    sheet.addRow({
      no: idx + 1,
      department: emp.department,
      position: emp.positionLabel ?? "",
      employeeNo: emp.employeeNo ?? "",
      name: emp.name,
      substances: substancesText,
      trainedAt: "",
      signature: "",
    });
  });

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  // 서명란은 직접 펜/터치로 기재하는 칸이라 행 높이를 넉넉히 준다.
  for (let r = 2; r <= employeeList.length + 1; r++) sheet.getRow(r).height = 28;

  const buffer = await workbook.xlsx.writeBuffer();
  const scopeLabel = department === COMMON_DEPARTMENT ? "원재료" : `${department}-${workProcess ?? "전체"}`;
  const fileName = `training-signoff-${scopeLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
