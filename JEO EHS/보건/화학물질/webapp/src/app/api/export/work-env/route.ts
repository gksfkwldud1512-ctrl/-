import ExcelJS from "exceljs";
import { getAllEmployees, getDashboardData } from "@/lib/db/repo";
import { loadWorkEnvState } from "@/lib/workEnvStore";
import { buildProcesses, EXCLUSION_CRITERIA, PRODUCT_STATUS_LABEL, VERDICT_LABEL } from "@/lib/workEnv";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 작업환경측정 예비조사표: 공정현황 / 대상물질 / 인원(야간 표시) 3개 시트. */
export async function GET() {
  const [employees, rows, state] = await Promise.all([getAllEmployees(), getDashboardData(), loadWorkEnvState()]);
  const processes = buildProcesses(employees, rows, state);

  const wb = new ExcelJS.Workbook();
  const bold = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  const s1 = wb.addWorksheet("공정현황");
  s1.columns = [
    { header: "부서", key: "d", width: 14 },
    { header: "공정", key: "p", width: 18 },
    { header: "인원", key: "h", width: 8 },
    { header: "야간근무자", key: "n", width: 10 },
    { header: "사용 부자재(종)", key: "c", width: 14 },
    { header: "측정 대상 성분", key: "i", width: 50 },
    { header: "판정", key: "v", width: 20 },
  ];
  for (const p of processes) {
    s1.addRow({
      d: p.department,
      p: p.process,
      h: p.headcount,
      n: p.nightCount,
      c: p.products.length,
      i: p.measureIngredientNames.join(", "),
      v: VERDICT_LABEL[p.verdict],
    });
  }
  bold(s1);

  const s2 = wb.addWorksheet("대상물질");
  s2.columns = [
    { header: "부서", key: "d", width: 14 },
    { header: "공정", key: "p", width: 18 },
    { header: "제품명", key: "pr", width: 28 },
    { header: "측정 대상 성분", key: "i", width: 26 },
    { header: "CAS번호", key: "cas", width: 14 },
    { header: "관리대상유해물질", key: "ct", width: 14 },
    { header: "상태", key: "st", width: 20 },
    { header: "월 사용(h)", key: "m", width: 10 },
    { header: "1일 사용(h)", key: "dy", width: 10 },
    { header: "제외 사유", key: "r", width: 30 },
    { header: "확인자", key: "by", width: 12 },
    { header: "확인일", key: "at", width: 12 },
  ];
  for (const p of processes) {
    for (const x of p.products) {
      const base = {
        d: p.department,
        p: p.process,
        pr: x.productName,
        st: PRODUCT_STATUS_LABEL[x.status],
        m: x.exclusion?.monthlyHours ?? "",
        dy: x.exclusion?.dailyHours ?? "",
        r: x.exclusion?.reason ?? "",
        by: x.exclusion?.confirmedBy ?? "",
        at: x.exclusion?.confirmedAt?.slice(0, 10) ?? "",
      };
      if (x.measureIngredients.length === 0) s2.addRow({ ...base, i: "(대상 성분 없음)" });
      for (const i of x.measureIngredients) {
        s2.addRow({ ...base, i: i.name, cas: i.casNo ?? "", ct: i.controlled ? "O" : "X" });
      }
    }
  }
  bold(s2);

  const s3 = wb.addWorksheet("인원");
  s3.columns = [
    { header: "부서", key: "d", width: 14 },
    { header: "공정", key: "p", width: 18 },
    { header: "사번", key: "no", width: 12 },
    { header: "성명", key: "nm", width: 12 },
    { header: "야간근무", key: "n", width: 10 },
  ];
  for (const p of processes) {
    for (const x of p.people) s3.addRow({ d: p.department, p: p.process, no: x.employeeNo ?? "", nm: x.name, n: x.night ? "O" : "" });
  }
  bold(s3);

  if (!EXCLUSION_CRITERIA.verified) {
    s1.addRow({});
    s1.addRow({ d: "※ 제외 기준(임시작업 월 24시간 미만, 단시간작업 1일 1시간 미만)은 법령 원문 대조 전 값입니다." });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `work-env-preliminary-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
