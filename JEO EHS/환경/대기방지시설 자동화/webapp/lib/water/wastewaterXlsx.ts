import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { LogDay, LogPlan } from "./wastewaterPlan";

const ROWS_PER_PAGE = 27; // 양식의 일자 행 수 (8~34행)
const FIRST_DATA_ROW = 8;
const LAST_DATA_ROW = FIRST_DATA_ROW + ROWS_PER_PAGE - 1; // 34
const FIRST_HEADER_ROW = 4;
const LAST_COL = 15; // O

const FONT_NAME = "한컴바탕"; // 양식(폐수일일일지.xlsx)과 같은 글꼴
// charset 129(한글)·family 1(Roman)을 양식과 동일하게 지정해야 엑셀이 같은 글꼴로 표시한다.
const BASE_FONT: Partial<ExcelJS.Font> = { name: FONT_NAME, size: 11, family: 1, charset: 129 };

function toExcelDate(date: string): Date {
  // 엑셀 날짜는 UTC 자정으로 넣어야 표시 날짜가 어긋나지 않는다.
  return new Date(`${date}T00:00:00Z`);
}

function sheetName(date: string): string {
  return `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}~`;
}

/** 표(A4:O34) 안쪽은 가는 선, 바깥 테두리는 굵은 선 — 양식과 동일. */
function tableBorder(row: number, col: number): Partial<ExcelJS.Borders> {
  const thin: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
  const medium: ExcelJS.Border = { style: "medium", color: { argb: "FF000000" } };
  return {
    left: col === 1 ? medium : thin,
    right: col === LAST_COL ? medium : thin,
    top: row === FIRST_HEADER_ROW ? medium : thin,
    bottom: row === LAST_DATA_ROW ? medium : thin,
  };
}

const CENTER: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };
const CENTER_WRAP: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };

/** 쪽(시트) 하나의 양식(머리글·테두리·열 너비·인쇄 설정)을 만든다. */
function createPageSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
      printArea: "A1:O35",
    },
    views: [{ state: "normal", zoomScale: 100 }],
  });

  // 열 너비 — 양식: A 10.66, C 11, L 11.78, M 11.22, 나머지 기본(8.43)
  const widths: Record<number, number> = { 1: 10.66, 2: 8.43, 3: 11, 12: 11.78, 13: 11.22 };
  for (let c = 1; c <= LAST_COL; c++) ws.getColumn(c).width = widths[c] ?? 8.43;

  // 행 높이
  ws.getRow(1).height = 14.4;
  ws.getRow(2).height = 15.6;
  ws.getRow(3).height = 16.2;
  for (let r = FIRST_HEADER_ROW; r <= 7; r++) ws.getRow(r).height = 14.4;
  for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW; r++) ws.getRow(r).height = 17.4;
  ws.getRow(LAST_DATA_ROW).height = 18;
  ws.getRow(35).height = 15.6;

  // 제목부
  ws.mergeCells("A1:B1");
  ws.getCell("A1").value = "[별지 제20호서식]";
  ws.getCell("A1").font = BASE_FONT;
  ws.getCell("A1").alignment = CENTER;

  ws.mergeCells("A2:O2");
  ws.getCell("A2").value = "폐수배출시설 운영일지";
  ws.getCell("A2").font = { ...BASE_FONT, size: 12 };
  ws.getCell("A2").alignment = CENTER;

  ws.mergeCells("A3:O3");
  ws.getCell("A3").value = "(「수질 및 수생태계 보전에 관한 법률 시행령」 제33조제2호 및 제3호에 따라 폐수를 처리하는 사업자가 적습니다)";
  ws.getCell("A3").font = { ...BASE_FONT, size: 12 };
  ws.getCell("A3").alignment = CENTER;

  // 표 머리글(4~7행)
  const merges = [
    "A4:A7", "B4:C4", "B5:B7", "C5:C7", "D4:D7", "E4:H4", "E5:E7", "F5:F7", "G5:G7", "H5:H7",
    "I4:I7", "J4:J7", "K4:M4", "K5:K7", "L5:L7", "M5:M7", "N4:N7", "O4:O7",
  ];
  merges.forEach((m) => ws.mergeCells(m));
  const headers: Record<string, string> = {
    A4: "연월일", B4: "결 재", D4: "가동시간", E4: "원료사용량", I4: "용수\n사용량\n(㎥)", J4: "폐수\n발생량\n(㎥)",
    K4: "폐수위탁처리", N4: "보관\n폐수량\n(㎥)", O4: "기타 중요사항",
    B5: "대표자", C5: "환경기술인", E5: "수용성\n방청유", F5: "금속\n방청유", G5: "비수용성\n방청유", H5: "열처리유",
    K5: "위탁량\n(㎥)", L5: "위탁ㆍ수탁\n확인서\n일련번호", M5: "처리\n업소명",
  };
  for (const [addr, text] of Object.entries(headers)) {
    ws.getCell(addr).value = text;
    ws.getCell(addr).font = BASE_FONT;
    ws.getCell(addr).alignment = CENTER_WRAP; // 긴 머리글(기타 중요사항 등)은 칸 너비에 맞춰 줄바꿈
  }

  // 일자 영역 병합(가동시간, 원료사용량)
  ws.mergeCells(`D${FIRST_DATA_ROW}:D${LAST_DATA_ROW}`);
  ws.mergeCells(`E${FIRST_DATA_ROW}:H${LAST_DATA_ROW}`);
  ws.getCell(`D${FIRST_DATA_ROW}`).value = "0~24";
  ws.getCell(`E${FIRST_DATA_ROW}`).value = "평균사용량 합계\n21L, 416L, 104L, 100L";
  ws.getCell(`D${FIRST_DATA_ROW}`).alignment = CENTER;
  ws.getCell(`E${FIRST_DATA_ROW}`).alignment = CENTER_WRAP;

  // 모든 칸에 글꼴·테두리 적용(병합 칸 포함 — 병합 영역의 테두리가 빠지지 않도록 칸마다 지정)
  for (let r = FIRST_HEADER_ROW; r <= LAST_DATA_ROW; r++) {
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = ws.getCell(r, c);
      cell.border = tableBorder(r, c);
      cell.font = BASE_FONT;
      if (r >= FIRST_DATA_ROW && !cell.alignment) cell.alignment = CENTER;
    }
  }
  for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW; r++) {
    ws.getCell(r, 1).numFmt = 'mm"월" dd"일"';
    ws.getCell(r, 1).alignment = CENTER;
  }

  // 용지 규격 안내(표 아래, 오른쪽 정렬)
  ws.getCell("O35").value = "297㎜×210㎜[일반용지60g/㎡(재활용품)]";
  ws.getCell("O35").font = { ...BASE_FONT, size: 12 };
  ws.getCell("O35").alignment = { horizontal: "right", vertical: "middle" };
  return ws;
}

/**
 * 폐수배출시설 운영일지(별지 제20호서식)를 27일 단위로 쪽(시트)마다 만든다.
 * 각 쪽의 첫 보관폐수량은 전쪽 마지막 값 + 당일 발생량 − 당일 위탁량(숫자), 나머지는 양식과 같은 수식이다.
 */
export async function buildWastewaterWorkbook(plan: LogPlan): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const pages: LogDay[][] = [];
  for (let i = 0; i < plan.days.length; i += ROWS_PER_PAGE) pages.push(plan.days.slice(i, i + ROWS_PER_PAGE));

  for (const pageDays of pages) {
    const ws = createPageSheet(wb, sheetName(pageDays[0].date));
    pageDays.forEach((d, i) => {
      const r = FIRST_DATA_ROW + i;
      ws.getCell(r, 1).value = toExcelDate(d.date);
      ws.getCell(r, 9).value = d.water;
      ws.getCell(r, 10).value = d.waste;
      if (d.haul > 0) ws.getCell(r, 11).value = d.haul; // 위탁한 날만 기재
      if (d.serials.length > 0) {
        ws.getCell(r, 12).value = d.serials.join(", ");
        if (d.serials.length > 1) ws.getCell(r, 12).alignment = { horizontal: "center", vertical: "middle", shrinkToFit: true };
      }
      if (d.companies.length > 0) ws.getCell(r, 13).value = d.companies.join(", ");
      ws.getCell(r, 14).value =
        i === 0 ? d.storage : { formula: `N${r - 1}+J${r}-K${r}`, result: d.storage }; // 쪽 첫 행은 이월 계산 결과를 숫자로
    });
  }

  wb.views = [{ x: 0, y: 0, width: 28800, height: 15000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  const out = await wb.xlsx.writeBuffer();
  return sanitizeXlsx(Buffer.from(out as ArrayBuffer), pages.length);
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

/** ExcelJS가 쓴 파일의 글꼴/시트속성 요소 순서를 스키마 순서로 맞춘다(실제 엑셀에서 열어 확인한 항목). */
async function sanitizeXlsx(buffer: Buffer, sheetCount: number): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  const stylesFile = zip.file("xl/styles.xml");
  if (stylesFile) {
    let styles = await stylesFile.async("string");
    styles = styles.replace(/<font>([\s\S]*?)<\/font>/g, (_m, inner: string) => `<font>${reorderChildren(inner, FONT_ORDER)}</font>`);
    zip.file("xl/styles.xml", styles);
  }

  for (let i = 1; i <= sheetCount; i++) {
    const f = zip.file(`xl/worksheets/sheet${i}.xml`);
    if (!f) continue;
    let xml = await f.async("string");
    xml = xml.replace(/<sheetPr>([\s\S]*?)<\/sheetPr>/, (_m, inner: string) => `<sheetPr>${reorderChildren(inner, SHEETPR_ORDER)}</sheetPr>`);
    zip.file(`xl/worksheets/sheet${i}.xml`, xml);
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
