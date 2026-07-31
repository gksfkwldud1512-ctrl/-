import { put, get } from "@vercel/blob";

// 사용자가 매번 확정(다운로드)하거나 직접 고친 한국어→영어 번역을 계속 누적 저장한다 — "완성본을
// 통해 항상 내가 원하는 방향과 동일하게" 요구사항을 실제 딥러닝/LLM 없이 실현하는 방법: 정확히
// 같은 문장이 다시 나오면 API를 다시 부르지 않고 예전에 확정된 번역을 그대로 재사용한다. 사용자가
// 영어 미리보기를 직접 수정하면 그 즉시 여기에 최우선으로 덮어써진다.
export type GlossaryEntry = {
  ko: string;
  en: string;
  updatedAt: string;
  /** 자동 번역(auto)인지 사용자가 직접 고친 것(manual)인지 — manual은 재번역으로 덮어쓰지 않는다. */
  source: "auto" | "manual";
};

export type Glossary = Record<string, GlossaryEntry>; // key = ko.trim()

const DATA_PATH = "meeting/glossary.json";

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

export async function loadGlossary(): Promise<Glossary> {
  try {
    const result = await get(DATA_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return {};
    const text = (await streamToBuffer(result.stream as ReadableStream<Uint8Array>)).toString("utf-8");
    return JSON.parse(text) as Glossary;
  } catch {
    return {};
  }
}

async function saveGlossary(glossary: Glossary): Promise<void> {
  await put(DATA_PATH, JSON.stringify(glossary), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function lookupGlossary(ko: string): Promise<string | null> {
  const glossary = await loadGlossary();
  return glossary[ko.trim()]?.en ?? null;
}

/** 자동 번역 결과 저장 — 이미 사용자가 직접 고친(manual) 항목이 있으면 덮어쓰지 않는다. */
export async function rememberTranslation(ko: string, en: string): Promise<void> {
  const glossary = await loadGlossary();
  const key = ko.trim();
  if (glossary[key]?.source === "manual") return;
  glossary[key] = { ko: key, en, updatedAt: new Date().toISOString(), source: "auto" };
  await saveGlossary(glossary);
}

/** 사용자가 영어 미리보기를 직접 수정했을 때 호출 — 이후 항상 이 값을 우선 사용한다. */
export async function correctTranslation(ko: string, en: string): Promise<void> {
  const glossary = await loadGlossary();
  const key = ko.trim();
  glossary[key] = { ko: key, en, updatedAt: new Date().toISOString(), source: "manual" };
  await saveGlossary(glossary);
}
