import { lookupGlossary, rememberTranslation } from "./glossary";

// Google 번역 웹사이트(translate.google.com)가 내부적으로 쓰는 비공식 엔드포인트 — API 키/가입/
// 카드 전혀 필요 없다. MyMemory는 실제 Vercel 서버 IP에서 테스트하니 "Tweet Tweet Tweet" 같은
// 쓸 수 없는 결과만 나와서(서비스 측 IP 차단으로 판단, 코드로 해결 불가) 포기했고, DeepL은 실제로는
// 30일 체험판만 있는 유료 서비스라 포기했다. 이건 공식 지원 API가 아니라서 예고 없이 막히거나
// 바뀔 수 있다 — 만약 이것도 막히면 남은 방법은 사실상 Vercel AI Gateway(유료, 카드 필요)뿐이다.
const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function translateViaGoogle(text: string): Promise<string> {
  const params = new URLSearchParams({ client: "gtx", sl: "ko", tl: "en", dt: "t", q: text });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) {
    throw new Error(`번역 서비스 오류 (HTTP ${res.status}) — 무료 비공식 엔드포인트가 막혔을 수 있습니다.`);
  }
  const data = await res.json();
  // 응답 형태: [[["번역문장1","원문1",...], ["번역문장2","원문2",...], ...], null, "ko", ...]
  // 문장이 길면 구글이 내부적으로 여러 조각으로 쪼개서 반환하므로 전부 이어붙인다.
  const segments = data?.[0];
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("번역 결과를 받지 못했습니다.");
  }
  return segments.map((seg: unknown[]) => seg?.[0] ?? "").join("");
}

/**
 * 줄바꿈은 보존한다. 각 줄마다: 먼저 글로서리(사용자가 예전에 승인/수정한 번역 기억)에서 정확히
 * 일치하는 문장이 있으면 API 호출 없이 그걸 그대로 쓰고, 없으면 번역한 뒤 글로서리에 저장해서
 * 다음에는 항상 같은 결과가 나오게 한다("내가 원하는 방향과 동일하게" 요구사항).
 */
async function translateOne(text: string): Promise<string> {
  if (!text.trim()) return "";
  const lines = text.split("\n");
  const translatedLines = await Promise.all(
    lines.map(async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      const remembered = await lookupGlossary(trimmed);
      if (remembered) return remembered;
      const translated = await translateViaGoogle(trimmed);
      await rememberTranslation(trimmed, translated);
      return translated;
    })
  );
  return translatedLines.join("\n");
}

export async function translateToEnglish(texts: string[]): Promise<string[]> {
  return Promise.all(texts.map(translateOne));
}
