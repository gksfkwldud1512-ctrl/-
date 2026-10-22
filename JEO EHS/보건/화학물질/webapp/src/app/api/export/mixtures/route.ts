import ExcelJS from "exceljs";
import { getDashboardData } from "@/lib/db/repo";
import { REVIEW_STATUS_LABEL } from "@/lib/format";
import { INDUSTRIAL_SAFETY_ACT_CATEGORIES } from "@/lib/law/categories";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 부서×공정×제품×물질×해당법령 요약을 엑셀로 내려받는다. 대시보드 화면과 동일한 데이터를 공유한다. */
export async function GET() {
  const rows = await getDashboardData();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("요약");

  sheet.columns = [
    { header: "부서", key: "department", width: 16 },
    { header: "공정", key: "workProcess", width: 16 },
    { header: "제품명", key: "productName", width: 28 },
    { header: "물질명", key: "ingredientName", width: 24 },
    { header: "CAS번호", key: "casNo", width: 14 },
    { header: "화관법 유해화학물질여부", key: "chemicalsAct", width: 18 },
    ...INDUSTRIAL_SAFETY_ACT_CATEGORIES.map((c) => ({
      header: c.label,
      key: c.key,
      width: 16,
    })),
    { header: "개정확인여부", key: "reviewStatus", width: 20 },
  ];

  for (const r of rows) {
    sheet.addRow({
      department: r.department,
      workProcess: r.workProcess,
      productName: r.productName,
      ingredientName: r.ingredientName,
      casNo: r.casNo ?? "",
      chemicalsAct: r.chemicalsActFlag ? "O" : "X",
      ...Object.fromEntries(
        INDUSTRIAL_SAFETY_ACT_CATEGORIES.map((c) => [c.key, r.categoryFlags[c.key] ? "O" : "X"])
      ),
      reviewStatus: REVIEW_STATUS_LABEL[r.reviewStatus],
    });
  }

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `chemical-substance-summary-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
