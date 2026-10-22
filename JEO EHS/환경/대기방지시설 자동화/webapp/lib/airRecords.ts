import { put, get } from "@vercel/blob";

// 대기운용기록부(SEMS 업로드용 엑셀 2종)는 다운로드 즉시 끝나는 상태 없는 기능이라 "해당 월에 만들었는지"를
// 알 수 없었다. 종합업무현황판이 월별 작성 여부를 판정할 수 있도록 다운로드할 때마다 {종류, 연, 월, 시각}만 기록한다.
export type AirRecordKind = "gongdong" | "unjeon"; // 배출구가동시간목록 | 시설운전사항목록

export type AirRecord = { kind: AirRecordKind; year: number; month: number; at: string };

const BLOB_PATH = "air/records.json";

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

export async function loadAirRecords(): Promise<AirRecord[]> {
  try {
    const result = await get(BLOB_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return [];
    return JSON.parse(await streamToString(result.stream as ReadableStream<Uint8Array>)) as AirRecord[];
  } catch {
    return [];
  }
}

/** 다운로드 기록 1건 추가. 실패해도 엑셀 다운로드 자체는 막지 않도록 예외를 삼킨다. */
export async function recordAirDownload(kind: AirRecordKind, year: number, month: number): Promise<void> {
  try {
    const list = await loadAirRecords();
    list.push({ kind, year, month, at: new Date().toISOString() });
    await put(BLOB_PATH, JSON.stringify(list), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    console.error("[air/records] 기록 실패", err);
  }
}
