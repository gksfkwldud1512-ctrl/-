import ExcelJS from "exceljs";
import { getDashboardData, getEmployeesForScope } from "@/lib/db/repo";
import { COMMON_DEPARTMENT } from "@/lib/constants";
import { filterRowsForTraining } from "@/lib/trainingScope";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27272A" } };

/** 글자수로 대략의 줄 수를 추정해 행 높이를 정한다(ExcelJS는 자동 높이를 계산하지 않는다). */
function rowHeightFor(texts: { text: string; chars: number }[], minHeight = 20): number {
  const lines = Math.max(...texts.map((t) => Math.max(1, Math.ceil(t.text.length / t.chars))));
  return Math.max(minHeight, lines * 15 + 6);
}

/**
 * 부서(+공정) 교육 서명지: 맨 위에 교육대상 물질(제품별 구성 성분)을 표로 정리하고,
 * 그 아래에 소속 인원 명단과 서명란을 둔다. A4 가로 1쪽 너비로 인쇄되도록 설정한다.
 */
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

  // 공정공통 제품은 모든 공정에서 쓰므로 어느 공정의 교육자료에도 포함한다.
  const scopedRows = filterRowsForTraining(allRows, department, workProcess || null);

  // 제품별로 구성 성분을 모은다. (해당 법령은 오해의 소지가 있어 서명지에 표시하지 않는다)
  type Product = { name: string; substances: Set<string> };
  const products = new Map<string, Product>();
  for (const r of scopedRows) {
    const p = products.get(r.mixtureId) ?? { name: r.productName, substances: new Set<string>() };
    p.substances.add(r.ingredientName);
    products.set(r.mixtureId, p);
  }
  const productList = Array.from(products.values()).sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const scopeTitle = department === COMMON_DEPARTMENT ? "원재료(공통)" : `${department}${workProcess ? ` · ${workProcess}` : ""}`;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("교육서명지", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  // A..G : 7열. 물질표와 명단표가 같은 열을 공유한다.
  sheet.columns = [{ width: 6 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 22 }];

  // 제목
  sheet.mergeCells("A1:G1");
  const title = sheet.getCell("A1");
  title.value = "화학물질 취급 안전보건 교육 서명지";
  title.font = { bold: true, size: 18 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 34;

  sheet.mergeCells("A2:D2");
  sheet.getCell("A2").value = `대상: ${scopeTitle}`;
  sheet.getCell("A2").font = { bold: true, size: 12 };
  sheet.mergeCells("E2:G2");
  sheet.getCell("E2").value = "교육일자:        년      월      일";
  sheet.getCell("E2").font = { size: 12 };
  sheet.getRow(2).height = 24;

  // 1. 교육대상 물질
  let row = 4;
  sheet.mergeCells(`A${row}:G${row}`);
  const sec1 = sheet.getCell(`A${row}`);
  sec1.value = `1. 교육대상 물질 (총 ${productList.length}종)`;
  sec1.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  sec1.fill = SECTION_FILL;
  sheet.getRow(row).height = 22;
  row++;

  const head1 = ["No", "제품명", "", "", "구성 성분", "", ""];
  head1.forEach((v, i) => (sheet.getCell(row, i + 1).value = v || undefined));
  sheet.mergeCells(`B${row}:D${row}`);
  sheet.mergeCells(`E${row}:G${row}`);
  for (let c = 1; c <= 7; c++) {
    const cell = sheet.getCell(row, c);
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }
  sheet.getRow(row).height = 22;
  row++;

  if (productList.length === 0) {
    sheet.mergeCells(`A${row}:G${row}`);
    sheet.getCell(`A${row}`).value = "(해당 물질 없음)";
    sheet.getCell(`A${row}`).alignment = { horizontal: "center" };
    row++;
  }
  productList.forEach((p, idx) => {
    const subs = Array.from(p.substances).join(", ") || "-";
    sheet.getCell(row, 1).value = idx + 1;
    sheet.getCell(row, 2).value = p.name;
    sheet.getCell(row, 5).value = subs;
    sheet.mergeCells(`B${row}:D${row}`);
    sheet.mergeCells(`E${row}:G${row}`);
    for (let c = 1; c <= 7; c++) {
      const cell = sheet.getCell(row, c);
      cell.border = BORDER;
      cell.alignment = { vertical: "middle", horizontal: c === 1 ? "center" : "left", wrapText: true };
    }
    sheet.getRow(row).height = rowHeightFor([
      { text: p.name, chars: 44 },
      { text: subs, chars: 52 },
    ]);
    row++;
  });

  // 2. 교육 대상자 명단 + 서명
  row++;
  sheet.mergeCells(`A${row}:G${row}`);
  const sec2 = sheet.getCell(`A${row}`);
  sec2.value = `2. 교육 대상자 및 서명 (총 ${employeeList.length}명)`;
  sec2.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  sec2.fill = SECTION_FILL;
  sheet.getRow(row).height = 22;
  row++;

  const head2 = ["No", "부서", "공정(포지션)", "사번", "성명", "교육일자", "서명"];
  head2.forEach((v, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = v;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  sheet.getRow(row).height = 22;
  const rosterHeaderRow = row;
  row++;

  if (employeeList.length === 0) {
    sheet.mergeCells(`A${row}:G${row}`);
    sheet.getCell(`A${row}`).value = "(해당 부서·공정 소속 직원 없음 — 임직원 명부를 확인해 주세요)";
    sheet.getCell(`A${row}`).alignment = { horizontal: "center" };
  }
  employeeList.forEach((emp, idx) => {
    const values = [idx + 1, emp.department, emp.positionLabel ?? "", emp.employeeNo ?? "", emp.name, "", ""];
    values.forEach((v, i) => {
      const cell = sheet.getCell(row, i + 1);
      cell.value = v === "" ? undefined : v;
      cell.border = BORDER;
      cell.alignment = { horizontal: i === 0 ? "center" : "left", vertical: "middle", wrapText: true };
    });
    sheet.getRow(row).height = 30; // 서명 칸
    row++;
  });

  // 인쇄: 명단이 여러 쪽이면 명단 헤더를 반복한다.
  sheet.pageSetup.printTitlesRow = `${rosterHeaderRow}:${rosterHeaderRow}`;

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
