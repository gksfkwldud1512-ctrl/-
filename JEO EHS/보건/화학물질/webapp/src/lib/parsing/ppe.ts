import type { PdfLine } from "./pdfText";
import { dedupeRepeatedRuns } from "./textClean";

// MSDS 8장 "노출방지 및 개인보호구"(국문 표기 변형 다수) / 영문 "Exposure controls/personal protection".
// 번호 접두사(8./８．)는 요구하지 않는다 — 전각 숫자, 줄바꿈 위치 변형 등으로 접두 매칭이 자주 깨진다.
const START_RE =
  /노출\s*방지\s*(?:및|\/)?\s*개인\s*보호구|개인\s*보호구|exposure\s*controls?\s*\/?\s*personal\s*protection/i;

// 9장 "물리화학적 특성"이 다음 섹션. 국/영문 표기 변형을 모두 커버.
const END_RE = /물리\s*[·ㆍ\/]?\s*화학적\s*특성|physical\s*(?:and|\/)?\s*chemical\s*properties/i;

const MAX_LENGTH = 2000;

/** 섹션8(노출방지 및 개인보호구) 구간의 원문을 best-effort로 잘라낸다. 실패 시 null. */
export function extractPpeTextFromLines(lines: PdfLine[]): string | null {
  const startIdx = lines.findIndex((l) => START_RE.test(l.text));
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (END_RE.test(lines[i].text)) {
      endIdx = i;
      break;
    }
  }

  const section = dedupeRepeatedRuns(
    lines
      .slice(startIdx, endIdx)
      .map((l) => l.text.trim())
      .filter(Boolean)
      .join("\n")
  );

  if (section.trim() === "") return null;
  return section.length > MAX_LENGTH ? section.slice(0, MAX_LENGTH) + " …(이하 생략)" : section;
}
