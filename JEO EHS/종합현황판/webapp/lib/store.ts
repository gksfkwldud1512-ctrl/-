import { put, get } from "@vercel/blob";
import fs from "node:fs/promises";
import path from "node:path";
import type { SettingsMap, TaskRecord } from "./types";

// 설정·완료 기록은 비공개 Blob JSON 한 개씩에 저장한다(다른 앱과 같은 방식).
// Blob 토큰이 없는 로컬 개발 환경에서는 .data/ 폴더의 파일로 대신 저장한다.
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_DIR = path.join(process.cwd(), ".data");

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

async function readJson<T>(pathname: string, fallback: T): Promise<T> {
  try {
    if (useBlob) {
      const result = await get(pathname, { access: "private", useCache: false });
      if (!result || !result.stream) return fallback;
      return JSON.parse(await streamToString(result.stream as ReadableStream<Uint8Array>)) as T;
    }
    return JSON.parse(await fs.readFile(path.join(LOCAL_DIR, pathname.replace(/\//g, "__")), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(pathname: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value);
  if (useBlob) {
    await put(pathname, text, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
    return;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, pathname.replace(/\//g, "__")), text, "utf-8");
}

export const loadSettings = () => readJson<SettingsMap>("dashboard/settings.json", {});
export const saveSettings = (s: SettingsMap) => writeJson("dashboard/settings.json", s);
export const loadRecords = () => readJson<TaskRecord[]>("dashboard/records.json", []);
export const saveRecords = (r: TaskRecord[]) => writeJson("dashboard/records.json", r);

/** 첨부 파일 저장 — 비공개 Blob(또는 로컬 .data/files)에 두고 /api/file 로 내려준다. */
export async function saveAttachment(name: string, data: Buffer, contentType: string): Promise<string> {
  const safe = name.replace(/[^\w.\-가-힣 ()]/g, "_");
  const pathname = `dashboard/files/${Date.now()}-${safe}`;
  if (useBlob) {
    await put(pathname, data, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType });
  } else {
    await fs.mkdir(path.join(LOCAL_DIR, "files"), { recursive: true });
    await fs.writeFile(path.join(LOCAL_DIR, "files", pathname.split("/").pop()!), data);
  }
  return pathname;
}

export async function readAttachment(pathname: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (!pathname.startsWith("dashboard/files/") || pathname.includes("..")) return null;
  try {
    if (useBlob) {
      const result = await get(pathname, { access: "private", useCache: false });
      if (!result || !result.stream) return null;
      const reader = (result.stream as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return { data: Buffer.concat(chunks), contentType: result.headers.get("content-type") || "application/octet-stream" };
    }
    return { data: await fs.readFile(path.join(LOCAL_DIR, "files", pathname.split("/").pop()!)), contentType: "application/octet-stream" };
  } catch {
    return null;
  }
}
