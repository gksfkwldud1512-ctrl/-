import ExcelJS from "exceljs";
import { WASTEWATER_TEMPLATE_BASE64 } from "./wastewaterTemplate";
import type { LogDay, LogPlan } from "./wastewaterPlan";

const ROWS_PER_PAGE = 27; // 양식의 일자 행 수 (8~34행)
const FIRST_ROW = 8;

function toExcelDate(date: string): Date {
  // 엑셀 날짜는 UTC 자정으로 넣어야 표시 날짜가 어긋나지 않는다.
  return new Date(`${date}T00:00:00Z`);
}

function sheetName(date: string): string {
  return `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}~`;
}

/**
 * 폐수배출시설 운영일지(별지 제20호서식) 양식을 27일 단위로 쪽(시트)마다 복제해 채운다.
 * 각 쪽의 첫 보관폐수량은 전쪽 마지막 값 + 당일 발생량 − 당일 위탁량(숫자), 나머지는 양식과 같은 수식이다.
 */
export async function buildWastewaterWorkbook(plan: LogPlan): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(WASTEWATER_TEMPLATE_BASE64, "base64") as unknown as ArrayBuffer);
  const template = wb.worksheets[0];
  const templateModel = JSON.parse(JSON.stringify(template.model));

  const pages: LogDay[][] = [];
  for (let i = 0; i < plan.days.length; i += ROWS_PER_PAGE) pages.push(plan.days.slice(i, i + ROWS_PER_PAGE));

  pages.forEach((pageDays, pageIdx) => {
    const ws = wb.addWorksheet(sheetName(pageDays[0].date));
    ws.model = {
      ...JSON.parse(JSON.stringify(templateModel)),
      name: ws.name,
      id: ws.id,
      mergeCells: templateModel.merges,
    };
    ws.pageSetup = { ...template.pageSetup };
    ws.pageSetup.printArea = "A1:O35";

    pageDays.forEach((d, i) => {
      const r = FIRST_ROW + i;
      ws.getCell(r, 1).value = toExcelDate(d.date);
      ws.getCell(r, 9).value = d.water;
      ws.getCell(r, 10).value = d.waste;
      if (d.haul > 0) ws.getCell(r, 11).value = d.haul; // 위탁한 날만 기재
      if (d.serials.length > 0) {
        ws.getCell(r, 12).value = d.serials.join(", ");
        ws.getCell(r, 12).alignment = { ...(ws.getCell(r, 12).alignment ?? {}), wrapText: true, shrinkToFit: d.serials.length > 1 };
      }
      if (d.companies.length > 0) ws.getCell(r, 13).value = d.companies.join(", ");
      if (i === 0) {
        ws.getCell(r, 14).value = d.storage; // 쪽 첫 행은 이월 계산 결과를 숫자로
      } else {
        ws.getCell(r, 14).value = { formula: `N${r - 1}+J${r}-K${r}`, result: d.storage };
      }
    });
    void pageIdx;
  });

  wb.removeWorksheet(template.id);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
