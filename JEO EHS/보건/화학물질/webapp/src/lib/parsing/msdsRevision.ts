import type { PdfLine } from "./pdfText";

export type MsdsRevisionInfo = {
  revisionDate: string | null; // YYYY-MM-DD
  reviewCycleYears: number | null;
};

// "개정일자"/"개정일"/"Revision Date"를 우선 찾고, 없으면 "작성일자"/"최초작성일자"/
// "Prepared date"/"Issue Date"로 대체한다. 개정일자는 통상 1장 상단과 16장(기타 참고사항)
// 근처에 반복 등장하는데, 실제 최신 개정 시점을 반영하는 쪽은 마지막(뒤쪽) 등장이므로
// 라벨이 여러 번 매치되면 마지막 값을 채택한다.
const REVISION_LABEL_RE =
  /(?:개정\s*일자|개정일|데이터\s*리비전|Data\s*Revision|Revision\s*Date|Date\s*of\s*[Rr]evision)\s*[:：]?\s*(\d{4}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}일?|\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)/;
const ISSUE_LABEL_RE =
  /(?:최초\s*작성일자|작성\s*일자|작성일|Prepared\s*[Dd]ate|Issue\s*Date|Date\s*of\s*[Ii]ssue)\s*[:：]?\s*(\d{4}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}일?|\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일)/;

// "재검토주기 : 3년" / "3년마다 재검토" 등 — MSDS 16장(기타 참고사항)의 관용 문구.
const CYCLE_LABEL_RE = /재검토\s*주기\s*[:：]?\s*(\d+)\s*년/;
const CYCLE_FALLBACK_RE = /(\d+)\s*년\s*(?:마다|주기로?)\s*재검토/;

function normalizeDateToken(raw: string): string | null {
  const ymd = /^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]?\s*(\d{1,2})\s*일?$/.exec(raw.trim());
  if (!ymd) return null;
  const year = Number(ymd[1]);
  const month = Number(ymd[2]);
  const day = Number(ymd[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findLastMatch(lines: PdfLine[], re: RegExp): string | null {
  let found: string | null = null;
  for (const line of lines) {
    const m = re.exec(line.text);
    if (m) found = m[1];
  }
  return found;
}

// 다수 MSDS는 "재검토주기" 문구 없이 개정일자(Data Revision 등)만 표기한다. 이 경우 개정일은
// 찾았는데 주기를 몰라 신호등 계산이 영영 "미확인"으로 남는 것을 막기 위해, 국내 통상 관행인
// 3년을 기본값으로 채운다 — 검토화면에서 실제 문서 기재값으로 언제든 수정 가능.
const DEFAULT_REVIEW_CYCLE_YEARS = 3;

/**
 * MSDS 전체 라인에서 개정일자와 재검토주기를 best-effort로 추출한다.
 * 문서 포맷이 매우 다양하므로 실패 시 null을 반환하며, 검토화면에서 수동 보완을 전제로 한다.
 */
export function extractRevisionInfoFromLines(lines: PdfLine[]): MsdsRevisionInfo {
  const revisionRaw = findLastMatch(lines, REVISION_LABEL_RE) ?? findLastMatch(lines, ISSUE_LABEL_RE);
  const revisionDate = revisionRaw ? normalizeDateToken(revisionRaw) : null;

  const cycleRaw = findLastMatch(lines, CYCLE_LABEL_RE) ?? findLastMatch(lines, CYCLE_FALLBACK_RE);
  const parsedCycle = cycleRaw ? Number(cycleRaw) : null;
  const reviewCycleYears =
    parsedCycle && parsedCycle > 0
      ? parsedCycle
      : revisionDate
        ? DEFAULT_REVIEW_CYCLE_YEARS
        : null;

  return { revisionDate, reviewCycleYears };
}
