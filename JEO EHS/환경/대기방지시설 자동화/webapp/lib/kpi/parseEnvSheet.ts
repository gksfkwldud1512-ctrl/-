import JSZip from "jszip";
import type { MonthlyPoint, SeriesKey, BreakdownSeriesKey } from "./parseDetails";

// 환경종합자료(사용자 관리 엑셀)의 "FY26" 시트를 읽어서 본사 DETAILS와 같은 모양의 월별 집계로 바꾼다.
// 이 파일은 브라우저에서 실행된다(엑셀이 5MB가 넘어 Vercel 요청 한도 4.5MB를 넘기 때문) —
// 그래서 exceljs 대신 JSZip + 시트 XML 직접 파싱으로 FY26 시트 하나만 읽고, parseDetails의 "값" 은 import하지 않는다
// (parseDetails는 exceljs를 끌어와 번들이 커진다 — 타입만 import).
// 수식 결과는 엑셀이 저장해 둔 값(<v>)을 그대로 쓴다 → 엑셀에서 저장한 상태로 올려야 한다.

export const ENV_SHEET_NAME = "FY26";
export const ENV_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"] as const;
const MONTH_NUMBER: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// ── 행 정의 ────────────────────────────────────────────────────────────────
// 행 번호는 현재 시트 기준이고, C열 라벨이 일치하는지 검사해서 시트 구조가 바뀌면 조용히 틀린 값을 쓰는 대신 오류로 멈춘다.
const R = {
  sales: 6,
  gasoline: 37, diesel: 38, electricity: 39, lng: 40, energyTotal: 42,
  scope1: 68, scope2: 69,
  resin: 74, wood: 75, oil: 78, incineration: 84,
  steel: 91, stainless: 92, copper: 93, novesin: 94, plastic: 95, paper: 96, tray: 97, vinyl: 98, processPlastic: 99,
  dustRecycle: 106, refractory: 107, dustLandfill: 108, wasteTotal: 109,
  waterDomestic: 115, waterProcess: 116, waterTotal: 117, sewage: 119, wastewater: 120,
} as const;

const EXPECTED_LABEL: Record<keyof typeof R, string> = {
  sales: "매출액(USD)",
  gasoline: "휘발유", diesel: "경유", electricity: "전기", lng: "LNG", energyTotal: "Total",
  scope1: "Scope 1 합계", scope2: "Scope2",
  resin: "폐합성수지", wood: "폐목재", oil: "폐유", incineration: "소각 유해폐기물",
  steel: "철", stainless: "스텐", copper: "구리", novesin: "노베신주", plastic: "플라스틱", paper: "파지",
  tray: "트레이", vinyl: "폐비닐", processPlastic: "공정플라스틱",
  dustRecycle: "분진 (재활용)", refractory: "내화물 (재활용)", dustLandfill: "분진 (매립)", wasteTotal: "폐기물 Total",
  waterDomestic: "일반용수", waterProcess: "공업용수", waterTotal: "용수 Total", sewage: "하수처리", wastewater: "폐수",
};

// 본사 DETAILS(앱에서 번역해 보여주는 이름과 동일하게 맞춤 → 이전 업로드 데이터와 항목명이 섞이지 않는다).
const NAME = {
  gasoline: "이동연소(자체차량) - 휘발유",
  diesel: "이동연소(자체차량) - 경유",
  electricity: "전력(그리드)",
  lng: "고정연소 - 천연가스",
  resin: "재활용 - 비유해 폐수지",
  wood: "목재",
  oil: "재활용 - 폐유기용제",
  incineration: "소각(에너지회수 없음) - 폐유기용제",
  steel: "고철",
  stainless: "기타 재활용 고형물",
  copper: "구리",
  plastic: "공정 폐플라스틱",
  paper: "종이",
  novesin: "노베신주",
  landfill: "매립 - 생산폐기물",
  waterDomestic: "취수 - 생활용수",
  waterProcess: "취수 - 공정용수",
  dischargeDomestic: "Domestic wastewater discharged",
  dischargeProcess: "Process wastewater discharged",
} as const;

// ── 엑셀(xlsx) 최소 파서 ───────────────────────────────────────────────────
type CellMap = Map<string, { text: string | null; num: number | null }>;

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function textOf(xml: string): string {
  // 후리가나(rPh) 제거 후 <t> 들을 이어 붙인다(서식 있는 텍스트 대응).
  const cleaned = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) out += m[1];
  return unescapeXml(out);
}

function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function indexToCol(idx: number): string {
  let s = "";
  let n = idx;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function readSheetCells(data: ArrayBuffer | Uint8Array, sheetName: string): Promise<CellMap> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("엑셀 파일을 열 수 없습니다. .xlsx 형식인지, 암호가 걸려 있지 않은지 확인해 주세요.");
  }
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wbXml || !relsXml) throw new Error("엑셀 구조(workbook.xml)를 읽을 수 없습니다.");

  let rId: string | null = null;
  const sheetNames: string[] = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml(attr(m[0], "name") ?? "");
    sheetNames.push(name);
    if (name === sheetName) rId = attr(m[0], "r:id");
  }
  if (!rId) {
    throw new Error(`"${sheetName}" 시트를 찾을 수 없습니다. (파일의 시트: ${sheetNames.filter((n) => !n.startsWith("Kangatang")).join(", ")})`);
  }
  let target: string | null = null;
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    if (attr(m[0], "Id") === rId) target = attr(m[0], "Target");
  }
  if (!target) throw new Error(`"${sheetName}" 시트의 파일 경로를 찾을 수 없습니다.`);
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) throw new Error(`"${sheetName}" 시트 내용을 읽을 수 없습니다.`);

  const ssXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const shared: string[] = [];
  if (ssXml) for (const m of ssXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const cells: CellMap = new Map();
  for (const m of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = attr(m[1], "r");
    const body = m[2];
    if (!ref || !body) continue;
    const type = attr(m[1], "t");
    if (type === "inlineStr") {
      cells.set(ref, { text: textOf(body), num: null });
      continue;
    }
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    if (v === undefined) continue;
    if (type === "s") cells.set(ref, { text: shared[Number(v)] ?? "", num: null });
    else if (type === "str") cells.set(ref, { text: unescapeXml(v), num: null });
    else if (type === "e" || type === "b") continue; // #DIV/0! 등 오류값, 불리언은 무시
    else {
      const n = Number(v);
      cells.set(ref, Number.isFinite(n) ? { text: null, num: n } : { text: v, num: null });
    }
  }
  return cells;
}

// ── FY26 시트 → 월별 원자료 ─────────────────────────────────────────────────
export type EnvMonthRaw = Record<keyof typeof R, number | null>;

export type EnvParsed = {
  fiscalYear: string; // 예: "2026/2027"
  months: EnvMonthRaw[]; // 길이 12 (Apr..Mar)
  /** 매출·에너지·폐기물·용수가 모두 입력된 달인지 (Apr부터 연속) */
  completeMonths: boolean[];
  /** 기본으로 제안하는 "마지막 반영 월" 인덱스(0=Apr). 완료된 달이 없으면 -1 */
  suggestedLastIndex: number;
};

export async function parseEnvWorkbook(data: ArrayBuffer | Uint8Array): Promise<EnvParsed[]> {
  const cells = await readSheetCells(data, ENV_SHEET_NAME);
  const str = (ref: string) => cells.get(ref)?.text?.trim() ?? "";
  const num = (ref: string) => cells.get(ref)?.num ?? null;

  // 라벨 검사
  const bad: string[] = [];
  for (const key of Object.keys(R) as (keyof typeof R)[]) {
    const got = str(`C${R[key]}`);
    if (got !== EXPECTED_LABEL[key]) bad.push(`C${R[key]}: "${EXPECTED_LABEL[key]}" 이어야 하는데 "${got}"`);
  }
  if (bad.length) {
    throw new Error(`FY26 시트 구조가 예상과 다릅니다(행이 추가/삭제된 것 같습니다). 시트 구조를 알려주세요.\n${bad.join("\n")}`);
  }

  // 1행의 "FY2627" 같은 라벨 위치에서 12개월 블록을 찾는다.
  const blocks: { label: string; startCol: number }[] = [];
  for (let c = 1; c <= 120; c++) {
    const label = str(`${indexToCol(c)}1`);
    if (/^FY\d{4}$/.test(label) && str(`${indexToCol(c)}2`) === "Apr") blocks.push({ label, startCol: c });
  }
  if (!blocks.length) throw new Error("FY26 시트 1행에서 'FY2627' 같은 연도 블록(2행이 Apr)을 찾지 못했습니다.");

  return blocks.map(({ label, startCol }) => {
    const fiscalYear = `20${label.slice(2, 4)}/20${label.slice(4, 6)}`;
    const months: EnvMonthRaw[] = ENV_MONTHS.map((_, i) => {
      const col = indexToCol(startCol + i);
      const row = {} as EnvMonthRaw;
      for (const key of Object.keys(R) as (keyof typeof R)[]) row[key] = num(`${col}${R[key]}`);
      return row;
    });
    const completeMonths = months.map(
      (m) => (m.sales ?? 0) > 0 && (m.electricity ?? 0) > 0 && (m.lng ?? 0) > 0 && (m.wasteTotal ?? 0) > 0 && (m.waterTotal ?? 0) > 0
    );
    let suggestedLastIndex = -1;
    while (suggestedLastIndex + 1 < 12 && completeMonths[suggestedLastIndex + 1]) suggestedLastIndex++;
    return { fiscalYear, months, completeMonths, suggestedLastIndex };
  });
}

// ── 월별 원자료 → 앱의 KpiSummary 조각 ──────────────────────────────────────
export type EnvPayload = {
  fiscalYear: string;
  lastMonth: string; // 반영한 마지막 달 (예: "Sep")
  sourceFilename: string;
  series: Record<SeriesKey, MonthlyPoint[]>;
  breakdown: Record<BreakdownSeriesKey, Record<string, MonthlyPoint[]>>;
};

const n0 = (v: number | null) => v ?? 0;

export function buildEnvPayload(
  parsed: EnvParsed,
  lastIndex: number,
  sourceFilename: string
): { payload: EnvPayload; warnings: string[] } {
  if (lastIndex < 0 || lastIndex > 11) throw new Error("반영할 마지막 월이 올바르지 않습니다.");
  const warnings: string[] = [];
  const [firstYear, secondYear] = parsed.fiscalYear.split("/").map((s) => parseInt(s, 10));

  // 매출이 비어 있는 달이 있으면 강도를 계산할 수 없으므로 중단한다.
  const noSales = ENV_MONTHS.slice(0, lastIndex + 1).filter((_, i) => !((parsed.months[i].sales ?? 0) > 0));
  if (noSales.length) {
    throw new Error(`매출액(USD, 6행)이 비어 있는 달이 있습니다: ${noSales.join(", ")}. 매출 실적을 입력한 뒤 다시 저장해서 올려 주세요.`);
  }

  const point = (i: number, value: number): MonthlyPoint => {
    const month = ENV_MONTHS[i];
    const monthNumber = MONTH_NUMBER[month];
    return {
      fiscalYear: parsed.fiscalYear, month, monthNumber,
      calendarYear: monthNumber >= 4 ? firstYear : secondYear,
      value,
      source: "env",
    };
  };
  const monthly = (fn: (m: EnvMonthRaw) => number): MonthlyPoint[] =>
    parsed.months.slice(0, lastIndex + 1).map((m, i) => point(i, fn(m)));

  const energyParts: [string, keyof EnvMonthRaw][] = [
    [NAME.electricity, "electricity"], [NAME.lng, "lng"], [NAME.gasoline, "gasoline"], [NAME.diesel, "diesel"],
  ];
  const wasteParts: [string, (m: EnvMonthRaw) => number][] = [
    [NAME.resin, (m) => n0(m.resin)],
    [NAME.wood, (m) => n0(m.wood)],
    [NAME.oil, (m) => n0(m.oil)],
    [NAME.incineration, (m) => n0(m.incineration)],
    [NAME.steel, (m) => n0(m.steel)],
    [NAME.stainless, (m) => n0(m.stainless)],
    [NAME.copper, (m) => n0(m.copper)],
    [NAME.plastic, (m) => n0(m.plastic) + n0(m.processPlastic)],
    [NAME.paper, (m) => n0(m.paper)],
    [NAME.novesin, (m) => n0(m.novesin)],
    // 본사는 매립을 총량에 포함한다(작년 4월 18.56톤). 엑셀 109행 합계에는 빠져 있어 따로 더하고 경고한다.
    [NAME.landfill, (m) => n0(m.dustLandfill)],
  ];
  const waterIn: [string, keyof EnvMonthRaw][] = [[NAME.waterDomestic, "waterDomestic"], [NAME.waterProcess, "waterProcess"]];
  const waterOut: [string, keyof EnvMonthRaw][] = [[NAME.dischargeDomestic, "sewage"], [NAME.dischargeProcess, "wastewater"]];

  const energy: Record<string, MonthlyPoint[]> = {};
  for (const [name, key] of energyParts) energy[name] = monthly((m) => n0(m[key]));
  const waste: Record<string, MonthlyPoint[]> = {};
  for (const [name, fn] of wasteParts) waste[name] = monthly(fn);
  const water: Record<string, MonthlyPoint[]> = {};
  for (const [name, key] of waterIn) water[name] = monthly((m) => n0(m[key]));
  const waterDischarge: Record<string, MonthlyPoint[]> = {};
  for (const [name, key] of waterOut) waterDischarge[name] = monthly((m) => n0(m[key]));

  // 값이 한 번도 없는 항목(노베신주 등)은 목록에서 뺀다.
  for (const group of [energy, waste, water, waterDischarge]) {
    for (const name of Object.keys(group)) if (group[name].every((p) => p.value === 0)) delete group[name];
  }

  const sumGroup = (g: Record<string, MonthlyPoint[]>, i: number) =>
    Object.values(g).reduce((acc, pts) => acc + (pts[i]?.value ?? 0), 0);
  const totalSeries = (g: Record<string, MonthlyPoint[]>): MonthlyPoint[] =>
    parsed.months.slice(0, lastIndex + 1).map((_, i) => point(i, sumGroup(g, i)));

  // 검산 + 주의 사항 (월별)
  for (let i = 0; i <= lastIndex; i++) {
    const m = parsed.months[i];
    const label = `${ENV_MONTHS[i]}`;
    if (Math.abs(sumGroup(energy, i) - n0(m.energyTotal)) > 0.5)
      warnings.push(`${label}: 에너지 항목 합(${sumGroup(energy, i).toFixed(1)})과 엑셀 Total(42행, ${n0(m.energyTotal).toFixed(1)})이 다릅니다.`);
    const wasteSum = sumGroup(waste, i);
    const landfill = n0(m.dustLandfill);
    if (Math.abs(wasteSum - landfill - n0(m.wasteTotal)) > 0.05)
      warnings.push(`${label}: 폐기물 항목 합(${(wasteSum - landfill).toFixed(2)}톤)과 엑셀 폐기물 Total(109행, ${n0(m.wasteTotal).toFixed(2)}톤)이 다릅니다 — 109행 수식에 빠진 항목이 있는지 확인하세요.`);
    if (landfill > 0)
      warnings.push(`${label}: 분진(매립) ${landfill}톤 — 엑셀 109행 합계에는 빠져 있지만 본사 기준대로 폐기물에 포함했습니다.`);
    if (n0(m.novesin) + n0(m.tray) + n0(m.vinyl) > 0)
      warnings.push(`${label}: 노베신주/트레이/폐비닐 값이 있습니다 — 엑셀 해당 행(94·97·98)은 kg→톤 변환(×10^-3)이 빠져 있어 단위(톤)를 확인하세요.`);
    if (Math.abs(sumGroup(water, i) - n0(m.waterTotal)) > 0.5)
      warnings.push(`${label}: 용수 항목 합과 엑셀 용수 Total(117행)이 다릅니다.`);
    const excluded = n0(m.dustRecycle) + n0(m.refractory);
    if (excluded > 0)
      warnings.push(`${label}: 분진(재활용)·내화물(재활용) ${excluded.toFixed(2)}톤은 본사 기준대로 폐기물에서 제외했습니다(정상).`);
  }

  const payload: EnvPayload = {
    fiscalYear: parsed.fiscalYear,
    lastMonth: ENV_MONTHS[lastIndex],
    sourceFilename,
    series: {
      energy: totalSeries(energy),
      waste: totalSeries(waste),
      water: totalSeries(water),
      waterDischarge: totalSeries(waterDischarge),
      // 엑셀의 온실가스는 kgCO2 단위라 본사 단위(tCO2e)로 환산한다.
      scope1: monthly((m) => n0(m.scope1) / 1000),
      scope2: monthly((m) => n0(m.scope2) / 1000),
      salesUSD: monthly((m) => n0(m.sales)),
    },
    breakdown: { energy, waste, water, waterDischarge },
  };
  return { payload, warnings };
}
