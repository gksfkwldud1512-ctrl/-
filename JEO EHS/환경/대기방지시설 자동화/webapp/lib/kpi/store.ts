import { put, get } from "@vercel/blob";
import type { KpiSummary } from "./parseDetails";

// 매출액 등 재무 데이터가 포함되어 있어 반드시 비공개(private) 스토어에 저장한다.
// 업로드할 때마다 같은 경로(kpi/latest.json)에 덮어써서 "항상 최신 파일 하나만 반영"되게 한다.
const BLOB_PATH = "kpi/latest.json";
// 파싱에 실패한 업로드 원본을 보관해서, 다음에 같은 문제가 재발했을 때 재현/재요청 없이
// 바로 그 파일을 열어 원인을 진단할 수 있게 한다. 항상 "가장 최근 실패 1건"만 덮어써서 보관.
const FAILED_UPLOAD_PATH = "kpi/last-failed-upload.xlsx";
const FAILED_UPLOAD_META_PATH = "kpi/last-failed-upload.meta.json";

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

/** 파싱 실패한 업로드 원본 + 에러 메시지를 보관 (가장 최근 실패 1건만 덮어씀). */
export async function saveFailedUpload(buffer: Buffer, filename: string, errorMessage: string): Promise<void> {
  try {
    await put(FAILED_UPLOAD_PATH, buffer, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await put(
      FAILED_UPLOAD_META_PATH,
      JSON.stringify({ filename, errorMessage, failedAt: new Date().toISOString() }),
      { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" }
    );
  } catch {
    // 실패 파일 보관 자체가 실패해도 원래 업로드 응답에는 영향 주지 않는다 (부가 기능이므로).
  }
}

export async function loadFailedUploadMeta(): Promise<{ filename: string; errorMessage: string; failedAt: string } | null> {
  try {
    const result = await get(FAILED_UPLOAD_META_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const text = await streamToString(result.stream as ReadableStream<Uint8Array>);
    return JSON.parse(text);
  } catch {
    return null;
  }
}
