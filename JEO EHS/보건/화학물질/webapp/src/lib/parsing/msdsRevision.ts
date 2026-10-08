import type { PdfLine } from "./pdfText";

export type MsdsRevisionInfo = {
  revisionDate: string | null; // YYYY-MM-DD
  reviewCycleYears: number | null;
};

// 날짜 토큰 — 형식이 문서마다 제각각이라 아래 형식을 모두 받는다.
//  A) 2025-03-04 / 2025.03.04 / 2025/3/4          (연-월-일)
//  B) 2025년 3월 4일
//  C) 14-07-2026 / 17.08.2023 / 10/23/2018 / 01/30/26   (일-월-연, 슬래시는 미국식 월/일/연 우선)
//  D) 1 Sep. 2025 / 29 Sep 2014 / 13 April 2015 / September 1, 2025
const MONTHS =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const DATE_TOKEN =
  "(" +
  [
    String.raw`\d{4}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}`,
    String.raw`\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일`,
    String.raw`\d{1,2}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*(?:\d{4}|\d{2})(?!\d)`,
    String.raw`\d{1,2}(?:st|nd|rd|th)?\s*(?:${MONTHS})\.?,?\s*\d{4}`,
    String.raw`(?:${MONTHS})\.?\s*\d{1,2}(?:st|nd|rd|th)?\s*,?\s*\d{4}`,
  ].join("|") +
  ")";

// "개정일자"/"개정 일자"/"Revision Date"/"Date of revision"을 우선 찾고, 없으면 "작성일자"/
// "Issue Date"/"Effective Date"로 대체한다. 개정일자는 통상 문서 곳곳에 반복 등장하는데 실제
// 최신 개정 시점을 반영하는 쪽은 마지막(뒤쪽) 등장이므로 라벨이 여러 번 매치되면 마지막 값을 채택한다.
const REVISION_LABELS = String.raw`개정\s*일자|개정\s*일|데이터\s*리비전|Data\s*Revision|Current\s*Revision|Revision\s*Date|Date\s*of\s*Revision`;
const ISSUE_LABELS = String.raw`최초\s*작성\s*일자|작성\s*일자|작성일|Prepared\s*Date|Date\s*of\s*Preparation|Issue\s*Date|Date\s*of\s*Issue|Effective\s*Date`;
// 라벨과 날짜 사이에 "." / "개정횟수 : 6 /" 같은 짧은 군더더기(30자 이내)가 끼는 문서가 있어 허용하되,
// 다른 날짜 라벨(일자/작성/date)을 건너뛰어 엉뚱한 날짜를 집지 않도록 막는다.
const GAP = String.raw`(?:(?!일자|작성|date)[^\n]){0,30}?`;
const REVISION_LABEL_RE = new RegExp(`(?:${REVISION_LABELS})${GAP}${DATE_TOKEN}`, "i");
const ISSUE_LABEL_RE = new RegExp(`(?:${ISSUE_LABELS})${GAP}${DATE_TOKEN}`, "i");
// 라벨만 있고 날짜는 다음 줄(들)에 이어지는 경우 — "다. 개정횟수 및 최종 개정일자 :" 뒤에 "16차/2020.04.20, 20차/2024.09.03".
const REVISION_LABEL_ONLY_RE = new RegExp(String.raw`(?:${REVISION_LABELS})\s*[:：.]?\s*$`, "i");
const ALL_DATES_RE = new RegExp(DATE_TOKEN, "gi");

// "재검토주기 : 3년" / "3년마다 재검토" 등 — MSDS 16장(기타 참고사항)의 관용 문구.
const CYCLE_LABEL_RE = /재검토\s*주기\s*[:：]?\s*(\d+)\s*년/;
const CYCLE_FALLBACK_RE = /(\d+)\s*년\s*(?:마다|주기로?)\s*재검토/;

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function toIso(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeDateToken(raw: string): string | null {
  const t = raw.trim();
  let m = /^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?$/.exec(t);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})\s*([.\-/])\s*(\d{1,2})\s*[.\-/]\s*(\d{4}|\d{2})$/.exec(t);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    const year = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]);
    // 슬래시는 미국식(월/일/연)이 흔하고, 하이픈·점은 일-월-연(국내/유럽)이 흔하다. 한쪽이 12를 넘으면 그쪽이 일(day).
    if (a > 12) return toIso(year, b, a);
    if (b > 12) return toIso(year, a, b);
    return m[2] === "/" ? toIso(year, a, b) : toIso(year, b, a);
  }

  m = /^(\d{1,2})(?:st|nd|rd|th)?\s*([A-Za-z]+)\.?,?\s*(\d{4})$/.exec(t);
  if (m) {
    const mon = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    return mon ? toIso(Number(m[3]), mon, Number(m[1])) : null;
  }
  m = /^([A-Za-z]+)\.?\s*(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})$/.exec(t);
  if (m) {
    const mon = MONTH_INDEX[m[1].slice(0, 3).toLowerCase()];
    return mon ? toIso(Number(m[3]), mon, Number(m[2])) : null;
  }
  return null;
}

// 일부 PDF는 굵은 글씨를 위해 같은 글자를 여러 번 겹쳐 찍어 "개정일자개정일자개정일자"처럼 추출된다.
// 숫자가 아닌 2글자 이상 덩어리가 연속 반복되면 한 번으로 줄인다(날짜 숫자는 건드리지 않는다).
function collapseRepeats(text: string): string {
  return text.replace(/([^\d]{2,}?)\1+/g, "$1");
}

function findLastMatch(lines: PdfLine[], re: RegExp): string | null {
  let found: string | null = null;
  for (const line of lines) {
    const m = re.exec(collapseRepeats(line.text));
    if (m) found = m[1];
  }
  return found;
}

function findLastDate(lines: PdfLine[], re: RegExp, labelOnlyRe?: RegExp): string | null {
  let found: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const text = collapseRepeats(lines[i].text);
    const m = re.exec(text);
    const iso = m ? normalizeDateToken(m[1]) : null;
    if (iso) {
      found = iso;
      continue;
    }
    if (labelOnlyRe?.test(text)) {
      // 다음 줄들(최대 3줄, 날짜가 이어지는 동안)의 날짜 중 가장 최신 것을 최종 개정일로 본다.
      let latest: string | null = null;
      for (let j = i + 1; j <= i + 3 && j < lines.length && lines[j].page === lines[i].page; j++) {
        const found2 = Array.from(collapseRepeats(lines[j].text).matchAll(ALL_DATES_RE))
          .map((x) => normalizeDateToken(x[1]))
          .filter((x): x is string => !!x);
        if (found2.length === 0) break;
        for (const d of found2) if (!latest || d > latest) latest = d;
      }
      if (latest) found = latest;
    }
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
  const revisionDate = findLastDate(lines, REVISION_LABEL_RE, REVISION_LABEL_ONLY_RE) ?? findLastDate(lines, ISSUE_LABEL_RE);

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
