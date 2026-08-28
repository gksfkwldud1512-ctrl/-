import { put, get } from "@vercel/blob";

// 법정교육 개별 항목. 법정 13개 이행항목(complianceItems.ts)과는 별개로,
// 안전보건교육(예: 관리감독자 교육, 특별안전보건교육 등)을 교육명 단위로 자유롭게
// 등록·추적하기 위한 독립 데이터다.
export type EducationCycleMonths = 1 | 3 | 6 | 12 | 24 | 36;

export const CYCLE_OPTIONS: { months: EducationCycleMonths; label: string }[] = [
  { months: 1, label: "매월" },
  { months: 3, label: "분기(3개월)" },
  { months: 6, label: "반기(6개월)" },
  { months: 12, label: "매년(12개월)" },
  { months: 24, label: "2년마다" },
  { months: 36, label: "3년마다" },
];

export type EducationItem = {
  id: string;
  name: string; // 법정교육명
  target: string; // 대상자
  cycleMonths: EducationCycleMonths; // 법정교육주기
  lastDate: string | null; // 최근교육일 (YYYY-MM-DD)
  qualification: string; // 자격요건
};

export type EducationStatus = "red" | "yellow" | "green" | "none";

export type EducationData = {
  updatedAt: string;
  items: EducationItem[];
};

const DATA_PATH = "education/items.json";
const VALID_CYCLES = new Set<EducationCycleMonths>([1, 3, 6, 12, 24, 36]);

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function loadEducationData(): Promise<EducationData> {
  try {
    const result = await get(DATA_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return { updatedAt: "", items: [] };
    const text = (await streamToBuffer(result.stream as ReadableStream<Uint8Array>)).toString("utf-8");
    const parsed = JSON.parse(text) as EducationData;
    if (!Array.isArray(parsed.items)) parsed.items = [];
    return parsed;
  } catch {
    return { updatedAt: "", items: [] };
  }
}

export async function saveEducationItems(items: EducationItem[]): Promise<EducationData> {
  const next: EducationData = { updatedAt: new Date().toISOString(), items };
  await put(DATA_PATH, JSON.stringify(next), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return next;
}

/** 자정 기준으로 맞춘 Date (시:분:초 영향 제거). */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 교육기한일 = 최근교육일 + 법정교육주기(개월). 최근교육일이 없으면 기한 계산 불가(null). */
export function computeDueDate(item: EducationItem): Date | null {
  if (!item.lastDate) return null;
  const base = new Date(item.lastDate);
  if (Number.isNaN(base.getTime())) return null;
  const due = new Date(base);
  due.setMonth(due.getMonth() + item.cycleMonths);
  return due;
}

/** 기한일까지 남은 일수. 음수면 기한 초과. */
export function computeDDay(item: EducationItem, today: Date = new Date()): number | null {
  const due = computeDueDate(item);
  if (!due) return null;
  const diffMs = atMidnight(due).getTime() - atMidnight(today).getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * red: 기한 초과 (아직 안 받았고 기한일이 지남)
 * yellow: 기한이 올해 안(오늘 포함) — 올해 받아야 함
 * green: 기한이 내년 이후 — 최근에 이미 받아서 여유 있음(완료 상태)
 * none: 최근교육일 미입력 — 아직 실시 이력 없음
 */
export function computeStatus(item: EducationItem, today: Date = new Date()): EducationStatus {
  const due = computeDueDate(item);
  if (!due) return "none";
  const todayMid = atMidnight(today);
  const dueMid = atMidnight(due);
  if (dueMid.getTime() < todayMid.getTime()) return "red";
  if (dueMid.getFullYear() === todayMid.getFullYear()) return "yellow";
  return "green";
}

const STATUS_PRIORITY: Record<EducationStatus, number> = { red: 0, yellow: 1, none: 2, green: 3 };

/** 초과(red)·임박(yellow) 항목이 위로 오도록 정렬 — 한눈에 조치 필요한 순서로 보이게. */
export function sortByUrgency(items: EducationItem[], today: Date = new Date()): EducationItem[] {
  return [...items].sort((a, b) => {
    const pa = STATUS_PRIORITY[computeStatus(a, today)];
    const pb = STATUS_PRIORITY[computeStatus(b, today)];
    if (pa !== pb) return pa - pb;
    const da = computeDDay(a, today);
    const db = computeDDay(b, today);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
}

export function isValidCycle(v: unknown): v is EducationCycleMonths {
  return typeof v === "number" && VALID_CYCLES.has(v as EducationCycleMonths);
}
