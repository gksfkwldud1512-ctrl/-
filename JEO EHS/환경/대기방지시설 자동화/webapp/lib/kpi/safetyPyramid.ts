import { put, get } from "@vercel/blob";
import { FISCAL_MONTHS } from "./parseDetails";

// 안전 피라미드(사망~유해위험요인) 6단계 — 이미지에 나온 순서/명칭을 그대로 따른다.
export const SAFETY_CATEGORIES = [
  { key: "fatalities", label: "사망" },
  { key: "lta", label: "휴업재해(LTA)" },
  { key: "ri", label: "기록재해(RI)" },
  { key: "fa", label: "응급처치(FA)" },
  { key: "nearMiss", label: "아차사고" },
  { key: "hazard", label: "유해위험요인" },
] as const;

export type SafetyCategoryKey = (typeof SAFETY_CATEGORIES)[number]["key"];
export type SafetyMonthly = Record<SafetyCategoryKey, Partial<Record<(typeof FISCAL_MONTHS)[number], number>>>;

export type SafetyPyramidData = {
  updatedAt: string;
  hasImage: boolean;
  monthly: SafetyMonthly;
};

const DATA_PATH = "kpi/safety-pyramid.json";
// 매번 같은 경로에 덮어써서(확장자 무관하게 고정 경로) 이전 업로드 잔여 파일이 안 남게 한다.
// 다른 KPI 원자료와 마찬가지로 반드시 비공개(private) 스토어에 저장한다 — 계정 스토어 자체가
// public access를 지원하지 않아, 웹페이지 표시/PPT 삽입 모두 서버에서 blob token으로 읽어 전달한다.
const IMAGE_PATH = "kpi/safety-pyramid-image";

function emptyMonthly(): SafetyMonthly {
  const monthly = {} as SafetyMonthly;
  for (const c of SAFETY_CATEGORIES) monthly[c.key] = {};
  return monthly;
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
    if (!result || !result.stream) return { updatedAt: "", hasImage: false, monthly: emptyMonthly() };
    const text = (await streamToBuffer(result.stream as ReadableStream<Uint8Array>)).toString("utf-8");
    const parsed = JSON.parse(text) as SafetyPyramidData;
    // 카테고리가 나중에 추가될 수 있으니 누락된 키는 빈 값으로 채운다.
    for (const c of SAFETY_CATEGORIES) if (!parsed.monthly[c.key]) parsed.monthly[c.key] = {};
    return parsed;
  } catch {
    return { updatedAt: "", hasImage: false, monthly: emptyMonthly() };
  }
}

async function saveSafetyPyramid(data: SafetyPyramidData): Promise<void> {
  await put(DATA_PATH, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function saveSafetyMonthly(monthly: SafetyMonthly): Promise<SafetyPyramidData> {
  const current = await loadSafetyPyramid();
  const next: SafetyPyramidData = { ...current, monthly, updatedAt: new Date().toISOString() };
  await saveSafetyPyramid(next);
  return next;
}

/** 피라미드 캡처 이미지를 업로드/교체한다 — 매번 같은 경로에 덮어써서 항상 최신 이미지 하나만 유지. */
export async function saveSafetyPyramidImage(fileBuffer: Buffer, contentType: string): Promise<SafetyPyramidData> {
  await put(IMAGE_PATH, fileBuffer, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
  const current = await loadSafetyPyramid();
  const next: SafetyPyramidData = { ...current, hasImage: true, updatedAt: new Date().toISOString() };
  await saveSafetyPyramid(next);
  return next;
}

/** 웹페이지 표시(프록시 API)와 PPT 삽입에서 공통으로 쓰는, 비공개 스토어에서 이미지 원본을 읽는 함수. */
export async function getSafetyPyramidImageBuffer(): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const result = await get(IMAGE_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const buffer = await streamToBuffer(result.stream as ReadableStream<Uint8Array>);
    const contentType = result.headers.get("content-type") || "image/png";
    return { buffer, contentType };
  } catch {
    return null;
  }
}
