import ExcelJS from "exceljs";
import type { GongdongRow, UnjeonRow } from "./calc";

const GONGDONG_HEADER = [
  "조사년도\n(고정값)",
  "배출구시설ID\n(고정값)",
  "배출구\n일련번호\n(고정값)",
  "허가증상\n배출구일련번호\n(고정값)",
  "배출구명\n(고정값)",
  "IEPS시설번호\n(고정값)",
  "가동일자\n(고정값)",
  "가동시간(시간)\n(사업장 입력)",
  "가동시간(분)\n(사업장 입력)",
  "비고\n(사업장 입력)",
];

const UNJEON_HEADER_ROW1 = [
  "조사년도",
  "배출구\n일련번호",
  "허가증상\n배출구일련번호",
  "배출구명",
  "방지시설ID",
  "방지시설\n일련번호",
  "허가증상\n방지시설번호",
  "방지시설명",
  "IEPS시설번호",
  "적산전력계번호",
  "운전일자",
  "전력검침량(kWh)\n(사업장 입력)",
  "약품명1\n(사업장 입력)",
  "사용량1\n(사업장 입력)",
  "단위1\n(입력)",
  "약품명2\n(사업장 입력)",
  "사용량2\n(사업장 입력)",
  "단위2\n(입력)",
  "약품명3\n(사업장 입력)",
  "사용량3\n(사업장 입력)",
  "단위3\n(입력)",
  "비고\n(사업장 입력)",
];

const UNJEON_HEADER_ROW2 = [
  "(고정값)",
  "(고정값)",
  "(고정값)",
  "(고정값)",
  "(고정값)",
  "(고정값)",
  "(고정값)",
  "(고정값)",
  "(고정값)",
  "(고정값)",
  "(고정값)",
  "정수[12].소수점[3]",
  "약품명 [50자]",
  "정수[10].소수점[3]",
  "선택",
  "약품명 [50자]",
  "정수[10].소수점[3]",
  "선택",
  "약품명 [50자]",
  "정수[10].소수점[3]",
  "선택",
  "선택 [50자]",
];

export async function buildGongdongWorkbook(year: number, rows: GongdongRow[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("배출구_가동시간_일괄업로드");
  ws.addRow(GONGDONG_HEADER);
  for (const r of rows) {
    ws.addRow([
      String(year),
      r.outletFacilityId,
      r.outletSerial,
      r.permitOutletSerial,
      r.outletName,
      null,
      r.date,
      r.hours,
      r.minutes,
      null,
    ]);
  }
  return wb;
}

export async function buildUnjeonWorkbook(year: number, rows: UnjeonRow[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("시설운전사항_일괄업로드");
  ws.addRow(UNJEON_HEADER_ROW1);
  ws.addRow(UNJEON_HEADER_ROW2);
  for (const r of rows) {
    ws.addRow([
      String(year),
      r.outletSerial,
      r.permitOutletSerial,
      r.outletName,
      r.preventionFacilityId,
      r.preventionSerial,
      r.permitPreventionNo,
      r.preventionName,
      null,
      r.meterNo,
      r.date,
      r.reading,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  }
  ws.getColumn(12).numFmt = "0.00";
  return wb;
}
