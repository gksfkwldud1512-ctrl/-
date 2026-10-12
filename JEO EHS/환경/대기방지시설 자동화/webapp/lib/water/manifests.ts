import { put, get } from "@vercel/blob";
import * as XLSX from "xlsx";

/** 폐수 위탁(인계) 1건 — 올바로시스템 '폐수위(수)탁 인계서 목록' 한 행. */
export type Manifest = {
  serialNo: string; // 수탁처리확인서번호 전체 (예: "1 2026 0000016-004487") — 중복 제거 키
  shortSerial: string; // 폐수일지에 적는 일련번호 (하이픈 뒤 번호, 예: "004487")
  date: string; // 인계일 YYYY-MM-DD
  company: string; // 폐수처리업자 (예: "그린이에스")
  amountM3: number; // 인계량(㎥)
};

const BLOB_PATH = "water/manifests.json";

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

export async function loadManifests(): Promise<Manifest[]> {
  try {
    const result = await get(BLOB_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return [];
    const list = JSON.parse(await streamToString(result.stream as ReadableStream<Uint8Array>)) as Manifest[];
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.serialNo.localeCompare(b.serialNo));
  } catch {
    return [];
  }
}

export async function saveManifests(list: Manifest[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(list), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** 수탁처리확인서번호에서 숫자만 남겨 뒤 6자리만 쓴다 (예: "1 2026 0000016-004487" → "004487"). */
export function lastSixDigits(serialNo: string): string {
  const digits = serialNo.replace(/\D/g, "");
  return digits.length > 6 ? digits.slice(-6) : digits;
}

function toDateString(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "string") {
    const m = /(\d{4})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/.exec(v);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return null;
}

function cleanCompany(raw: string): string {
  return raw.replace(/\(주\)|㈜|주식회사/g, "").trim();
}

/**
 * 올바로 '폐수위(수)탁 인계서' 목록(.xls/.xlsx)을 파싱한다.
 * 헤더 이름(인계일/폐수처리업자/수탁처리확인서번호/인계량)으로 열을 찾기 때문에 열 순서가 바뀌어도 동작한다.
 */
export function parseManifestWorkbook(buffer: Buffer): { manifests: Manifest[]; skipped: string[] } {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("시트를 찾을 수 없습니다.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  const findCol = (label: string, from = 0): { row: number; col: number } | null => {
    for (let r = from; r < rows.length; r++) {
      const c = (rows[r] ?? []).findIndex((v) => typeof v === "string" && v.replace(/\s/g, "") === label);
      if (c >= 0) return { row: r, col: c };
    }
    return null;
  };

  const dateH = findCol("인계일");
  const companyH = findCol("폐수처리업자");
  const serialH = findCol("수탁처리확인서번호");
  const amountH = findCol("인계량");
  if (!dateH || !companyH || !serialH || !amountH) {
    throw new Error("인계서 목록 형식이 아닙니다. (인계일/폐수처리업자/수탁처리확인서번호/인계량 열을 찾지 못했습니다)");
  }
  const unitH = findCol("단위", amountH.row);
  const firstDataRow = Math.max(dateH.row, amountH.row) + 1;

  const manifests: Manifest[] = [];
  const skipped: string[] = [];
  for (let r = firstDataRow; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const date = toDateString(row[dateH.col]);
    const serialNo = String(row[serialH.col] ?? "").trim();
    if (!date || !serialNo) continue;
    const amount = Number(String(row[amountH.col] ?? "").replace(/,/g, ""));
    const unit = unitH ? String(row[unitH.col] ?? "").trim() : "㎥";
    if (!Number.isFinite(amount) || amount <= 0) {
      skipped.push(`${date} ${serialNo}: 인계량을 읽지 못했습니다`);
      continue;
    }
    if (unit && !/㎥|m3|m³/i.test(unit)) {
      skipped.push(`${date} ${serialNo}: 지원하지 않는 단위(${unit})`);
      continue;
    }
    const shortSerial = lastSixDigits(serialNo);
    manifests.push({
      serialNo,
      shortSerial,
      date,
      company: cleanCompany(String(row[companyH.col] ?? "")),
      amountM3: amount,
    });
  }
  if (manifests.length === 0) throw new Error("인계 내역을 찾지 못했습니다.");
  return { manifests, skipped };
}

/** 기존 목록에 새 항목을 합친다(수탁처리확인서번호가 같으면 새 값으로 갱신). */
export function mergeManifests(existing: Manifest[], incoming: Manifest[]): { merged: Manifest[]; added: number } {
  const map = new Map(existing.map((m) => [m.serialNo, m]));
  let added = 0;
  for (const m of incoming) {
    if (!map.has(m.serialNo)) added++;
    map.set(m.serialNo, m);
  }
  const merged = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date) || a.serialNo.localeCompare(b.serialNo));
  return { merged, added };
}
