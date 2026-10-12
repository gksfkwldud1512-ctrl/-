import ExcelJS from "exceljs";
import JSZip from "jszip";
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
  return sanitizeXlsx(Buffer.from(out as ArrayBuffer), plan.days.length > 0 ? pages.length : 0);
}

// CT_Font / CT_SheetPr 자식 요소의 스키마 순서 — 엑셀은 이 순서가 어긋나면 "복구하시겠습니까?" 후 열지 못한다.
const FONT_ORDER = ["b", "i", "strike", "condense", "extend", "outline", "shadow", "u", "vertAlign", "sz", "color", "name", "family", "charset", "scheme"];
const SHEETPR_ORDER = ["tabColor", "outlinePr", "pageSetUpPr"];

function reorderChildren(xml: string, order: string[]): string {
  const parts = xml.match(/<[A-Za-z][^>]*\/>/g) ?? [];
  const rank = (el: string) => {
    const i = order.indexOf(/^<([A-Za-z0-9]+)/.exec(el)?.[1] ?? "");
    return i === -1 ? order.length : i;
  };
  return [...parts].sort((a, b) => rank(a) - rank(b)).join("");
}

/**
 * 양식(xlsx)을 불러와 복제한 결과에는 엑셀이 받아들이지 않는 부분이 남는다:
 *  - styles.xml 글꼴 요소 순서(color/family/scheme/sz/name …)
 *  - 시트 속성(sheetPr) 요소 순서
 *  - 통합문서 보기 firstSheet(양식의 시트 수 기준 값)가 새 시트 수보다 큰 경우
 *  - 인쇄 설정의 비정상 dpi(4294967295)
 * 실제 엑셀에서 열어 확인한 항목만 고친다.
 */
async function sanitizeXlsx(buffer: Buffer, sheetCount: number): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  const stylesFile = zip.file("xl/styles.xml");
  if (stylesFile) {
    let styles = await stylesFile.async("string");
    styles = styles.replace(/<font>([\s\S]*?)<\/font>/g, (_m, inner: string) => `<font>${reorderChildren(inner, FONT_ORDER)}</font>`);
    zip.file("xl/styles.xml", styles);
  }

  const wbFile = zip.file("xl/workbook.xml");
  if (wbFile) {
    let wbXml = await wbFile.async("string");
    wbXml = wbXml.replace(/<workbookView[^>]*\/>/, '<workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" firstSheet="0" activeTab="0"/>');
    zip.file("xl/workbook.xml", wbXml);
  }

  for (let i = 1; i <= sheetCount + 1; i++) {
    const f = zip.file(`xl/worksheets/sheet${i}.xml`);
    if (!f) continue;
    let xml = await f.async("string");
    xml = xml.replace(/<sheetPr>([\s\S]*?)<\/sheetPr>/, (_m, inner: string) => `<sheetPr>${reorderChildren(inner, SHEETPR_ORDER)}</sheetPr>`);
    xml = xml.replace(/ (?:horizontalDpi|verticalDpi)="\d+"/g, "");
    zip.file(`xl/worksheets/sheet${i}.xml`, xml);
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
