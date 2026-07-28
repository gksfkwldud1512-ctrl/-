import { put, get } from "@vercel/blob";
import type { KpiSummary } from "./parseDetails";

// 매출액 등 재무 데이터가 포함되어 있어 반드시 비공개(private) 스토어에 저장한다.
// 업로드할 때마다 같은 경로(kpi/latest.json)에 덮어써서 "항상 최신 파일 하나만 반영"되게 한다.
const BLOB_PATH = "kpi/latest.json";

export async function saveKpiSummary(summary: KpiSummary): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(summary), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

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

export async function loadKpiSummary(): Promise<KpiSummary | null> {
  try {
    const result = await get(BLOB_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const text = await streamToString(result.stream as ReadableStream<Uint8Array>);
    return JSON.parse(text) as KpiSummary;
  } catch {
    return null;
  }
}
