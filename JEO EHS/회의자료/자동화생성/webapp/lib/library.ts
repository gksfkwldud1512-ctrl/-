import { put, get, list } from "@vercel/blob";
import JSZip from "jszip";

// 사용자가 실제로 완성해서 쓴 회의자료 PPT를 업로드해서 모아두는 "완성본 라이브러리".
// 진짜 딥러닝/LLM 기반으로 "번역 어휘·양식을 자동 학습"하려면 서버에 LLM API가 붙어있어야 하는데
// (Vercel AI Gateway는 이 팀 계정에 결제수단이 없어 막혀 있음), 지금은 그 대신 업로드된 완성본의
// 텍스트를 그대로 추출해서 날짜별로 목록화해두는 정도로 구현한다 — 사용자가 지난 회차 문구를 직접
// 참고할 수 있고, 이 도구로 만든 초안·번역 이력은 이미 lib/glossary.ts에 계속 쌓인다.
export type LibraryEntry = {
  id: string;
  fileName: string;
  label: string; // 사용자가 붙이는 설명(예: "2026-08-03 주간회의")
  uploadedAt: string;
  blobPath: string;
  slideTexts: string[][]; // 슬라이드별로 추출된 텍스트 줄 목록
};

const INDEX_PATH = "meeting/library/index.json";
const FILE_PREFIX = "meeting/library/files/";

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

export async function loadLibraryIndex(): Promise<LibraryEntry[]> {
  try {
    const result = await get(INDEX_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return [];
    const text = (await streamToBuffer(result.stream as ReadableStream<Uint8Array>)).toString("utf-8");
    const parsed = JSON.parse(text) as LibraryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLibraryIndex(entries: LibraryEntry[]): Promise<void> {
  await put(INDEX_PATH, JSON.stringify(entries), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** pptx 파일 바이트에서 슬라이드별 텍스트(<a:t> 노드)를 순서대로 추출한다 — 이번 세션에서 원본
 * 템플릿을 분석할 때 쓴 것과 같은 방식(정규식으로 <a:t> 태그 텍스트만 뽑기). */
async function extractSlideTexts(buffer: Buffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return na - nb;
    });

  const slideTexts: string[][] = [];
  for (const path of slideFiles) {
    const xml = await zip.files[path].async("string");
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).filter((t) => t.trim());
    slideTexts.push(texts);
  }
  return slideTexts;
}

export async function uploadToLibrary(fileName: string, label: string, buffer: Buffer): Promise<LibraryEntry> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const blobPath = `${FILE_PREFIX}${id}.pptx`;
  await put(blobPath, buffer, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });

  const slideTexts = await extractSlideTexts(buffer);
  const entry: LibraryEntry = { id, fileName, label, uploadedAt: new Date().toISOString(), blobPath, slideTexts };

  const index = await loadLibraryIndex();
  index.unshift(entry); // 최신순
  await saveLibraryIndex(index);
  return entry;
}

export async function deleteFromLibrary(id: string): Promise<void> {
  const index = await loadLibraryIndex();
  const next = index.filter((e) => e.id !== id);
  await saveLibraryIndex(next);
  // 실제 blob 파일 삭제는 @vercel/blob의 del()을 쓸 수도 있지만, 인덱스에서만 빼도 목록엔 안 보이고
  // 스토리지 용량도 크지 않아 1차 구현에서는 생략(필요해지면 추가).
}

export async function getLibraryFile(blobPath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const result = await get(blobPath, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const buffer = await streamToBuffer(result.stream as ReadableStream<Uint8Array>);
    const contentType = result.headers.get("content-type") || "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    return { buffer, contentType };
  } catch {
    return null;
  }
}

// list()는 향후 blob 스토어 직접 나열이 필요해지면 쓰기 위해 재노출(현재는 index.json으로 충분).
export { list };
