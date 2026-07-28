import ExcelJS from "exceljs";

export const FISCAL_MONTHS = [
  "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar",
] as const;

const MONTH_NUMBER: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

export type SeriesKey = "energy" | "waste" | "water" | "scope1" | "scope2" | "salesUSD";

export const SERIES_META: Record<SeriesKey, { label: string; unit: string }> = {
  energy: { label: "에너지 사용량", unit: "GJ" },
  waste: { label: "폐기물 발생량", unit: "ton" },
  water: { label: "용수 사용량", unit: "㎥" },
  scope1: { label: "Scope 1 배출량", unit: "tCO2e" },
  scope2: { label: "Scope 2 배출량", unit: "tCO2e" },
  salesUSD: { label: "매출액", unit: "USD" },
};

// SPHERA/E MASTER 내보내기(DETAILS 파일)의 MEASURES LEVEL0/LEVEL1 조합으로 각 지표를 식별한다.
// 주의: "Total Water Withdrawal [m3]" LEVEL0에는 취수량(b) 항목과 배출량(c) 항목이 섞여 있어
// LEVEL1이 "b)"로 시작하는 취수량만 골라야 하고, "Carbon emission [tCO2e]"에는 Scope1/2를 합산한
// "Scope 1 + 2 Emissions" 행이 별도로 더 있어 그대로 다 더하면 중복 집계된다 — Scope1/Scope2는
// 반드시 LEVEL1을 정확히 지정해서 골라야 한다.
const SERIES_MATCH: Record<SeriesKey, (level0: string, level1: string) => boolean> = {
  energy: (l0) => l0 === "Total energy consumption [GJ]",
  waste: (l0) => l0 === "Total waste generated [t]",
  water: (l0, l1) => l0 === "Total Water Withdrawal [m3]" && l1.trim().startsWith("b)"),
  scope1: (l0, l1) => l0 === "Carbon emission [tCO2e]" && l1.trim() === "Scope 1 emissions [t CO2e]",
  scope2: (l0, l1) => l0 === "Carbon emission [tCO2e]" && l1.trim() === "Scope 2 Emissions [t CO2e]",
  salesUSD: (l0, l1) => l0 === "Intensity Normalisers [USD]" && l1.trim() === "Site Sales [USD]",
};

export type MonthlyPoint = {
  fiscalYear: string; // 예: "2024/2025"
  month: string; // Apr..Mar
  monthNumber: number; // 1~12 (달력 기준)
  calendarYear: number;
  value: number;
};

export type KpiSummary = {
  uploadedAt: string;
  sourceFilename: string;
  series: Record<SeriesKey, MonthlyPoint[]>;
};

function calendarYearOf(fiscalYearLabel: string, monthNumber: number): number {
  const [first, second] = fiscalYearLabel.split("/").map((s) => parseInt(s, 10));
  return monthNumber >= 4 ? first : second;
}

export async function parseKpiDetailsWorkbook(buffer: Buffer, filename: string): Promise<KpiSummary> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("워크시트를 찾을 수 없습니다.");

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = String(cell.value ?? "").trim();
  });
  const colIndex = (name: string) => headers.findIndex((h) => h === name);

  const iLevel0 = colIndex("MEASURES LEVEL0");
  const iLevel1 = colIndex("MEASURES LEVEL1");
  const iMonth = colIndex("MONTH");
  const iYear = colIndex("YEAR");
  const iValue = colIndex("VALUE");

  if ([iLevel0, iLevel1, iMonth, iYear, iValue].some((i) => i < 1)) {
    throw new Error(
      "필요한 컬럼(MEASURES LEVEL0/LEVEL1/MONTH/YEAR/VALUE)을 찾을 수 없습니다. SPHERA/E MASTER 내보내기 형식인지 확인해 주세요."
    );
  }

  // key: seriesKey -> "fiscalYear|month" -> 합계
  const sums: Record<SeriesKey, Map<string, number>> = {
    energy: new Map(), waste: new Map(), water: new Map(),
    scope1: new Map(), scope2: new Map(), salesUSD: new Map(),
  };

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const level0 = String(row.getCell(iLevel0).value ?? "").trim();
    const level1 = String(row.getCell(iLevel1).value ?? "").trim();
    const month = String(row.getCell(iMonth).value ?? "").trim();
    const fiscalYear = String(row.getCell(iYear).value ?? "").trim();
    const rawValue = row.getCell(iValue).value;
    const value = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue ?? ""));
    if (!level0 || !month || !fiscalYear || Number.isNaN(value)) continue;

    for (const key of Object.keys(SERIES_MATCH) as SeriesKey[]) {
      if (!SERIES_MATCH[key](level0, level1)) continue;
      const mapKey = `${fiscalYear}|${month}`;
      sums[key].set(mapKey, (sums[key].get(mapKey) ?? 0) + value);
    }
  }

  const series = {} as Record<SeriesKey, MonthlyPoint[]>;
  for (const key of Object.keys(sums) as SeriesKey[]) {
    const points: MonthlyPoint[] = [];
    for (const [mapKey, value] of sums[key].entries()) {
      const [fiscalYear, month] = mapKey.split("|");
      const monthNumber = MONTH_NUMBER[month];
      if (!monthNumber) continue;
      points.push({
        fiscalYear,
        month,
        monthNumber,
        calendarYear: calendarYearOf(fiscalYear, monthNumber),
        value,
      });
    }
    points.sort((a, b) => a.calendarYear - b.calendarYear || a.monthNumber - b.monthNumber);
    series[key] = points;
  }

  return { uploadedAt: new Date().toISOString(), sourceFilename: filename, series };
}
