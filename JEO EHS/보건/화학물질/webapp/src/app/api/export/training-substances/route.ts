import ExcelJS from "exceljs";
import { getDashboardData } from "@/lib/db/repo";
import { COMMON_DEPARTMENT } from "@/lib/constants";
import { filterRowsForTraining } from "@/lib/trainingScope";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 특정 부서(+공정) 범위에서 다루는 물질/보호구 목록을 엑셀로 내려받는다. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department");
  const workProcess = searchParams.get("workProcess");
  if (!department) {
    return new Response(JSON.stringify({ error: "department 파라미터가 필요합니다." }), { status: 400 });
  }

  const allRows = await getDashboardData();
  // 공정공통 제품은 모든 공정에서 쓰므로 어느 공정의 교육자료에도 포함한다.
  const rows = filterRowsForTraining(allRows, department, workProcess || null);

  // 제품(mixtureId) 단위로 성분을 묶어 보호구는 제품당 한 번만 표시한다.
  const byMixture = new Map<string, { productName: string; ppeText: string | null; rows: typeof rows }>();
  for (const r of rows) {
    if (!byMixture.has(r.mixtureId)) byMixture.set(r.mixtureId, { productName: r.productName, ppeText: r.ppeText, rows: [] });
    byMixture.get(r.mixtureId)!.rows.push(r);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("교육물질");
  sheet.columns = [
    { header: "제품명", key: "productName", width: 26 },
    { header: "물질명", key: "ingredientName", width: 22 },
    { header: "CAS번호", key: "casNo", width: 14 },
    { header: "보호구(MSDS 8장)", key: "ppe", width: 40 },
  ];

  for (const { productName, ppeText, rows: productRows } of byMixture.values()) {
    productRows.forEach((r, idx) => {
      sheet.addRow({
        productName: idx === 0 ? productName : "",
        ingredientName: r.ingredientName,
        casNo: r.casNo ?? "",
        ppe: idx === 0 ? (ppeText ?? "") : "",
      });
    });
  }

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const scopeLabel = department === COMMON_DEPARTMENT ? "원재료" : `${department}-${workProcess ?? "전체"}`;
  const fileName = `training-substances-${scopeLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
