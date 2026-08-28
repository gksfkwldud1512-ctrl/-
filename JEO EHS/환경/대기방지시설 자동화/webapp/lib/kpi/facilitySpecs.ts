import { put, get } from "@vercel/blob";
import type { FixtureType } from "./fixturePresets";

// 용수관리 시설배치도의 각 사용처(화장실/샤워장/식당/보일러/쿨링타워/각 세척기)별
// 세부 스펙(대수, 제품, 용수사용량, 비고)을 사용자가 직접 입력해 보관한다.
// 이 데이터로 용수사용량을 역산(이론 사용량 vs 실측 배출량 비교)하는 데 쓴다.
// KpiSummary와 무관하게 별도 파일로 저장(업로드할 때마다 덮어써지는 kpi/latest.json과
// 충돌하지 않도록).

// 화장실/샤워장/식당처럼 한 시설 안에 여러 종류의 기구가 섞여 있는 경우의 기구 1건.
export type FixtureEntry = {
  id: string;
  type: FixtureType;
  customTypeName?: string; // type이 "기타"일 때 직접 입력한 이름
  quantity: number; // 대수
  unitUsageL: number; // 1회 사용량(L) — 프리셋 기본값에서 시작, 실제 제품 기준으로 수정 가능
  usesPerDayPerUnit?: number; // 1대당 1일 평균 사용횟수 — 모르면 비워둠(이론 사용량 계산에서 제외됨)
  note?: string;
};

export type FacilitySpec = {
  quantity?: number; // 대수 (기구 목록이 필요 없는 단일 설비용 — 보일러/쿨링타워/세척기 등)
  model?: string; // 제품/모델명
  waterUsage?: string; // 용수 사용량 (단위가 시설마다 달라 자유 서식으로 입력: "1대당 200L/hr" 등)
  note?: string; // 비고
  fixtures?: FixtureEntry[]; // 화장실/샤워장/식당 전용 — 기구 종류별 세부 목록
};

export type FacilitySpecs = Record<string, FacilitySpec>; // key = 시설명(예: "화장실")

const BLOB_PATH = "kpi/facility-specs.json";

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function loadFacilitySpecs(): Promise<FacilitySpecs> {
  try {
    const result = await get(BLOB_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return {};
    const text = await streamToString(result.stream as ReadableStream<Uint8Array>);
    return JSON.parse(text) as FacilitySpecs;
  } catch {
    return {};
  }
}

export async function saveFacilitySpecs(specs: FacilitySpecs): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(specs), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}
