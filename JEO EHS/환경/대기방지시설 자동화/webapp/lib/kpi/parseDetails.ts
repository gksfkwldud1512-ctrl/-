import ExcelJS from "exceljs";

export const FISCAL_MONTHS = [
  "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar",
] as const;

const MONTH_NUMBER: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

export type SeriesKey = "energy" | "waste" | "water" | "waterDischarge" | "scope1" | "scope2" | "salesUSD";
// 하위 항목(구성 내역)까지 조회 가능한 지표만 별도로 세분화해서 보관한다.
export type BreakdownSeriesKey = "energy" | "waste" | "water" | "waterDischarge";

export const SERIES_META: Record<SeriesKey, { label: string; unit: string }> = {
  energy: { label: "에너지 사용량", unit: "GJ" },
  waste: { label: "폐기물 발생량", unit: "ton" },
  water: { label: "용수 사용량", unit: "㎥" },
  waterDischarge: { label: "용수 배출량", unit: "㎥" },
  scope1: { label: "Scope 1 배출량", unit: "tCO2e" },
  scope2: { label: "Scope 2 배출량", unit: "tCO2e" },
  salesUSD: { label: "매출액", unit: "USD" },
};

// SPHERA/E MASTER 내보내기(DETAILS 파일)의 MEASURES LEVEL0/LEVEL1 조합으로 각 지표를 식별한다.
// 주의: "Total Water Withdrawal [m3]" LEVEL0에는 취수량(b) 항목과 배출량(c) 항목이 섞여 있어
// LEVEL1이 "b)"로 시작하면 취수(소비)량, "c)"로 시작하면 배출량이다(용수관리 화면에서 사용).
// "Carbon emission [tCO2e]"에는 Scope1/2를 합산한 "Scope 1 + 2 Emissions" 행이 별도로 더 있어
// 그대로 다 더하면 중복 집계된다 — Scope1/Scope2는 반드시 LEVEL1을 정확히 지정해서 골라야 한다.
const SERIES_MATCH: Record<SeriesKey, (level0: string, level1: string) => boolean> = {
  energy: (l0) => l0 === "Total energy consumption [GJ]",
  waste: (l0) => l0 === "Total waste generated [t]",
  water: (l0, l1) => l0 === "Total Water Withdrawal [m3]" && l1.trim().startsWith("b)"),
  waterDischarge: (l0, l1) => l0 === "Total Water Withdrawal [m3]" && l1.trim().startsWith("c)"),
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
  // 에너지/폐기물/용수는 MEASURES(가장 세부 항목) 단위 내역도 함께 보관해 하위 데이터 조회를 지원한다.
  breakdown: Record<BreakdownSeriesKey, Record<string, MonthlyPoint[]>>;
};

function calendarYearOf(fiscalYearLabel: string, monthNumber: number): number {
  const [first, second] = fiscalYearLabel.split("/").map((s) => parseInt(s, 10));
  return monthNumber >= 4 ? first : second;
}

// SPHERA/E MASTER 내보내기의 MEASURES 값은 영문이라, 화면/보고서에 그대로 노출하지 않고
// 한국어로 번역해서 보여준다. 여기 없는 새 항목은 원문 그대로 폴백된다.
const MEASURE_NAME_KO: Record<string, string> = {
  "Electricity (grid)": "전력(그리드)",
  "Stationary energy - Natural gas": "고정연소 - 천연가스",
  "Mobile energy (own fleet) - Gasoline/petrol": "이동연소(자체차량) - 휘발유",
  "Mobile energy (own fleet) - Diesel": "이동연소(자체차량) - 경유",
  "Mobile energy (own fleet) - LPG": "이동연소(자체차량) - LPG",
  "Steel": "고철",
  "Recycled - non-hazardous waste resin": "재활용 - 비유해 폐수지",
  "Wood": "목재",
  "Paper": "종이",
  "Other recyclable solid materials": "기타 재활용 고형물",
  "Recycled - Waste organic solvent": "재활용 - 폐유기용제",
  "Incineration (without energy recovery) - Waste organic solvent": "소각(에너지회수 없음) - 폐유기용제",
  "Process plastics": "공정 폐플라스틱",
  "Water withdrawal - Domestic use": "취수 - 생활용수",
  "Water withdrawal - Process use": "취수 - 공정용수",
};

/** "Electricity (grid) [GJ]" -> "Electricity (grid)" 처럼 끝의 단위 표기를 정리한 뒤 한국어로 번역한다. */
function cleanMeasureName(raw: string): string {
  const cleaned = raw.replace(/\s*\[[^\]]*\]\s*$/, "").trim() || raw.trim();
  return MEASURE_NAME_KO[cleaned] ?? cleaned;
}

function pointsFromMap(map: Map<string, number>): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (const [mapKey, value] of map.entries()) {
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
  return points;
}

const REQUIRED_HEADERS = ["MEASURES LEVEL0", "MEASURES LEVEL1", "MEASURES", "MONTH", "YEAR", "VALUE"] as const;

/** 파일 앞부분이 zip(PK) 시그니처인지 확인. .xlsx는 zip 컨테이너이므로, 이게 아니면
 *  구버전 .xls이거나 손상된 파일 — exceljs가 알아듣기 힘든 저수준 에러를 던지기 전에 미리 걸러낸다. */
function looksLikeZip(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
}

function readHeaderRow(ws: ExcelJS.Worksheet): string[] {
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = String(cell.value ?? "").trim();
  });
  return headers;
}

export async function parseKpiDetailsWorkbook(buffer: Buffer, filename: string): Promise<KpiSummary> {
  if (!looksLikeZip(buffer)) {
    throw new Error(
      "업로드한 파일이 표준 Excel(.xlsx) 형식이 아닌 것 같습니다. 예전 형식(.xls)이거나 파일이 손상됐을 수 있습니다. " +
        "Excel에서 파일을 열어 '다른 이름으로 저장 → Excel 통합 문서(.xlsx)'로 다시 저장한 뒤 업로드해 주세요."
    );
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      "엑셀 파일을 여는 데 실패했습니다. 암호로 보호되어 있거나 손상된 파일일 수 있습니다. " +
        `암호가 걸려 있다면 해제한 뒤 다시 저장해서 업로드해 주세요. (상세: ${detail})`
    );
  }

  if (wb.worksheets.length === 0) throw new Error("워크시트를 찾을 수 없습니다.");

  // 필요한 헤더를 모두 가진 시트를 자동으로 찾는다 (기존: 무조건 첫 번째 시트만 봄 —
  // 새 내보내기 파일에 표지/요약 시트가 추가되면 엉뚱한 시트를 읽어서 깨졌었다).
  let ws: ExcelJS.Worksheet | undefined;
  let headers: string[] = [];
  const sheetReport: { name: string; headers: string[] }[] = [];
  for (const candidate of wb.worksheets) {
    const h = readHeaderRow(candidate);
    sheetReport.push({ name: candidate.name, headers: h.filter(Boolean) });
    if (REQUIRED_HEADERS.every((req) => h.includes(req))) {
      ws = candidate;
      headers = h;
      break;
    }
  }

  if (!ws) {
    const found = sheetReport
      .map((s) => `- [${s.name}] 시트에서 찾은 헤더: ${s.headers.length ? s.headers.join(", ") : "(헤더 없음)"}`)
      .join("\n");
    throw new Error(
      `필요한 컬럼(${REQUIRED_HEADERS.join("/")})을 어떤 시트에서도 찾지 못했습니다. ` +
        `SPHERA/E MASTER 내보내기 형식인지 확인해 주세요.\n\n[파일에서 실제로 찾은 헤더]\n${found}`
    );
  }

  const colIndex = (name: string) => headers.findIndex((h) => h === name);

  const iLevel0 = colIndex("MEASURES LEVEL0");
  const iLevel1 = colIndex("MEASURES LEVEL1");
  const iMeasure = colIndex("MEASURES");
  const iMonth = colIndex("MONTH");
  const iYear = colIndex("YEAR");
  const iValue = colIndex("VALUE");

  // key: seriesKey -> "fiscalYear|month" -> 합계
  const sums: Record<SeriesKey, Map<string, number>> = {
    energy: new Map(), waste: new Map(), water: new Map(), waterDischarge: new Map(),
    scope1: new Map(), scope2: new Map(), salesUSD: new Map(),
  };
  // key: seriesKey -> measureName -> "fiscalYear|month" -> 합계
  const breakdownSums: Record<BreakdownSeriesKey, Map<string, Map<string, number>>> = {
    energy: new Map(), waste: new Map(), water: new Map(), waterDischarge: new Map(),
  };

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const level0 = String(row.getCell(iLevel0).value ?? "").trim();
    const level1 = String(row.getCell(iLevel1).value ?? "").trim();
    const measure = String(row.getCell(iMeasure).value ?? "").trim();
    const month = String(row.getCell(iMonth).value ?? "").trim();
    const fiscalYear = String(row.getCell(iYear).value ?? "").trim();
    const rawValue = row.getCell(iValue).value;
    const value = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue ?? ""));
    if (!level0 || !month || !fiscalYear || Number.isNaN(value)) continue;

    for (const key of Object.keys(SERIES_MATCH) as SeriesKey[]) {
      if (!SERIES_MATCH[key](level0, level1)) continue;
      const mapKey = `${fiscalYear}|${month}`;
      sums[key].set(mapKey, (sums[key].get(mapKey) ?? 0) + value);

      if (key === "energy" || key === "waste" || key === "water" || key === "waterDischarge") {
        const measureName = cleanMeasureName(measure) || "기타";
        const byMeasure = breakdownSums[key];
        if (!byMeasure.has(measureName)) byMeasure.set(measureName, new Map());
        const m = byMeasure.get(measureName)!;
        m.set(mapKey, (m.get(mapKey) ?? 0) + value);
      }
    }
  }

  const series = {} as Record<SeriesKey, MonthlyPoint[]>;
  for (const key of Object.keys(sums) as SeriesKey[]) {
    series[key] = pointsFromMap(sums[key]);
  }

  const breakdown = {} as Record<BreakdownSeriesKey, Record<string, MonthlyPoint[]>>;
  for (const key of Object.keys(breakdownSums) as BreakdownSeriesKey[]) {
    const perMeasure: Record<string, MonthlyPoint[]> = {};
    for (const [measureName, map] of breakdownSums[key].entries()) {
      perMeasure[measureName] = pointsFromMap(map);
    }
    breakdown[key] = perMeasure;
  }

  return { uploadedAt: new Date().toISOString(), sourceFilename: filename, series, breakdown };
}
