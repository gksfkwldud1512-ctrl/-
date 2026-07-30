import { put, get } from "@vercel/blob";
import { FISCAL_MONTHS } from "./parseDetails";

// 안전 피라미드(사망~유해위험요인) 6단계 — 위(중대재해)일수록 좁고 옅은 색, 아래(선행지표)일수록
// 넓고 진한 오렌지색으로 그린다. 이 배열의 순서 자체가 피라미드의 위→아래 순서다.
// hasTarget: 원본 캡처(엑셀 SAFETY PYRAMID 대시보드) 기준, 연간 목표 개념이 있는 건 아차사고·
// 유해위험요인 두 항목뿐이다(나머지 4개는 "0건이 목표"인 항목이라 목표 입력/표시 자체가 없음).
export const SAFETY_CATEGORIES = [
  { key: "fatalities", label: "사망", hasTarget: false },
  { key: "lta", label: "휴업재해(LTA)", hasTarget: false },
  { key: "ri", label: "기록재해(RI)", hasTarget: false },
  { key: "fa", label: "응급처치(FA)", hasTarget: false },
  { key: "nearMiss", label: "아차사고", hasTarget: true },
  { key: "hazard", label: "유해위험요인", hasTarget: true },
] as const;

export type SafetyCategoryKey = (typeof SAFETY_CATEGORIES)[number]["key"];
export type SafetyMonthly = Record<SafetyCategoryKey, Partial<Record<(typeof FISCAL_MONTHS)[number], number>>>;
export type SafetyTargets = Record<SafetyCategoryKey, number>;

export type SafetyPyramidData = {
  updatedAt: string;
  monthly: SafetyMonthly;
  /** 카테고리별 연간 목표(건수). 목표 대비 진도(YTD)는 경과월수로 안분해서 계산한다. */
  targets: SafetyTargets;
};

export type SafetyPyramidStat = {
  key: SafetyCategoryKey;
  label: string;
  hasTarget: boolean;
  actual: number;
  /** hasTarget=false인 카테고리는 target/targetYtd/achievedPct가 전부 null이다(원본 캡처와 동일하게 공란 처리). */
  target: number | null;
  targetYtd: number | null;
  achievedPct: number | null;
};

export type PyramidArrow = { dir: "up" | "right" | "down"; color: string };

/**
 * 실적과 목표YTD를 비교해 원본 캡처와 동일한 화살표를 만든다.
 * 초과 달성(위쪽, 초록) / 목표 부합(오른쪽, 초록) / 목표 미달(아래쪽, 경고색) — 셋 다 사용자가
 * 원본 캡처를 보고 확정해준 규칙이다(미달 케이스는 원본엔 없었지만 대칭적으로 추가).
 */
export function pyramidArrow(actual: number, targetYtd: number | null): PyramidArrow | null {
  if (targetYtd === null) return null;
  if (actual > targetYtd) return { dir: "up", color: "2E7D32" };
  if (actual === targetYtd) return { dir: "right", color: "2E7D32" };
  return { dir: "down", color: "C0392B" };
}

const DATA_PATH = "kpi/safety-pyramid.json";

// 사용자가 제공한 원본 캡처(엑셀 SAFETY PYRAMID 대시보드)와 동일한 배색 — 위(중대재해)일수록
// 옅은 회갈색, 아래(선행지표)일수록 진한 오렌지(회사 브랜드 오렌지 F58220 계열)로 짙어진다.
const PYRAMID_COLOR_STOPS: [number, number, number][] = [
  [217, 199, 186], // 사망 — 옅은 회갈색
  [221, 183, 156], // 휴업재해(LTA)
  [227, 166, 124], // 기록재해(RI)
  [238, 155, 85], // 응급처치(FA)
  [245, 130, 32], // 아차사고 — 브랜드 오렌지(F58220)
  [226, 105, 12], // 유해위험요인 — 가장 진한 오렌지
];

export function pyramidColorHex(index: number): string {
  const stop = PYRAMID_COLOR_STOPS[index] ?? PYRAMID_COLOR_STOPS[PYRAMID_COLOR_STOPS.length - 1];
  return stop.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** 배경색 밝기에 따라 글자색을 검정/흰색으로 자동 선택한다(위쪽 옅은 단은 검정, 아래쪽 진한 단은 흰색). */
export function pyramidTextColorHex(index: number): string {
  const stop = PYRAMID_COLOR_STOPS[index] ?? PYRAMID_COLOR_STOPS[PYRAMID_COLOR_STOPS.length - 1];
  const [r, g, b] = stop;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 160 ? "333333" : "FFFFFF";
}

/**
 * 피라미드 boundaryIndex번째 경계선(0=맨 꼭대기 정점, count=바닥)의 너비 비율(0~1, 전체 너비 대비).
 * 순수 선형(원본 캡처와 동일)이라 맨 꼭대기는 폭 0인 뾰족한 점이고, 각 단의 높이가 같으므로
 * 경계선 너비도 0, 1/count, 2/count, ... 1로 균등하게 늘어난다.
 */
export function pyramidWidthFrac(boundaryIndex: number, count: number): number {
  return boundaryIndex / count;
}

function emptyMonthly(): SafetyMonthly {
  const monthly = {} as SafetyMonthly;
  for (const c of SAFETY_CATEGORIES) monthly[c.key] = {};
  return monthly;
}

function emptyTargets(): SafetyTargets {
  const targets = {} as SafetyTargets;
  for (const c of SAFETY_CATEGORIES) targets[c.key] = 0;
  return targets;
}

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

export async function loadSafetyPyramid(): Promise<SafetyPyramidData> {
  try {
    const result = await get(DATA_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return { updatedAt: "", monthly: emptyMonthly(), targets: emptyTargets() };
    const text = (await streamToBuffer(result.stream as ReadableStream<Uint8Array>)).toString("utf-8");
    const parsed = JSON.parse(text) as SafetyPyramidData;
    // 카테고리가 나중에 추가될 수 있으니 누락된 키는 빈 값으로 채운다.
    if (!parsed.monthly) parsed.monthly = emptyMonthly();
    if (!parsed.targets) parsed.targets = emptyTargets();
    for (const c of SAFETY_CATEGORIES) {
      if (!parsed.monthly[c.key]) parsed.monthly[c.key] = {};
      if (typeof parsed.targets[c.key] !== "number") parsed.targets[c.key] = 0;
    }
    return parsed;
  } catch {
    return { updatedAt: "", monthly: emptyMonthly(), targets: emptyTargets() };
  }
}

export async function saveSafetyPyramid(monthly: SafetyMonthly, targets: SafetyTargets): Promise<SafetyPyramidData> {
  const next: SafetyPyramidData = { monthly, targets, updatedAt: new Date().toISOString() };
  await put(DATA_PATH, JSON.stringify(next), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return next;
}

/** 어느 월까지 실적이 입력됐는지(회계연도 4월 기준 경과월수)를 전 카테고리를 통틀어 계산한다. */
export function monthsElapsed(monthly: SafetyMonthly): number {
  let lastIdx = -1;
  for (const c of SAFETY_CATEGORIES) {
    for (let i = 0; i < FISCAL_MONTHS.length; i++) {
      if (monthly[c.key][FISCAL_MONTHS[i]] !== undefined) lastIdx = Math.max(lastIdx, i);
    }
  }
  return lastIdx + 1;
}

/** 카테고리별 누적 실적/목표(YTD 안분)/달성률을 계산한다. 피라미드 그래픽·표에서 공통으로 쓴다. */
export function computePyramidStats(data: SafetyPyramidData): SafetyPyramidStat[] {
  const elapsed = monthsElapsed(data.monthly);
  return SAFETY_CATEGORIES.map((c) => {
    const actual = FISCAL_MONTHS.reduce((sum, m) => sum + (data.monthly[c.key][m] ?? 0), 0);
    if (!c.hasTarget) {
      return { key: c.key, label: c.label, hasTarget: false, actual, target: null, targetYtd: null, achievedPct: null };
    }
    const target = data.targets[c.key] ?? 0;
    const targetYtd = Math.round(((target * elapsed) / 12) * 10) / 10;
    const achievedPct = targetYtd > 0 ? Math.round((actual / targetYtd) * 1000) / 10 : null;
    return { key: c.key, label: c.label, hasTarget: true, actual, target, targetYtd, achievedPct };
  });
}
