import type { PdfLine } from "./pdfText";

// MSDS 1장(화학제품과 회사에 관한 정보)은 항상 문서 맨 앞부분에 나오므로 검색 범위를
// 앞쪽 줄로 제한한다 — 뒤쪽 성분표/유해성 정보에서 흔한 단어가 오탐되는 것을 방지.
const SEARCH_LINE_LIMIT = 40;

// "Product name :", "Trade name:" 처럼 다른 라벨 뒤에 붙는 "name"까지 걸리지 않도록
// 확실한 라벨(제조자/공급자/Company/Supplier)만 먼저 시도한다. 단순 "Name:"은
// 그 줄에 product/trade/제품 같은 단어가 없을 때만 별도로 시도한다
// (EOS Corp 포맷: "...Supplier's details Name: JFE Steel Corporation"처럼
// 라벨과 값이 뒤섞여 한 줄에 렌더링되는 경우까지 잡기 위해 줄 시작 위치로 제한하지 않는다).
const STRONG_INLINE_RE = /(?:제조자|제조사|공급자|Company|Supplier|Manufacturer)\s*[:：]\s*(.+)/i;
const NAME_ONLY_INLINE_RE = /Name\s*[:：]\s*(.+)/i;
const NAME_FALSE_POSITIVE_RE = /product|trade|제품/i;
const LABEL_ONLY_RE = /제조자|제조사|공급자|Supplier|Manufacturer/i;
const NON_VALUE_RE = /^(주소|address|전화|tel|fax|팩스|phone|http|긴급)/i;
// 값 자리에 라벨 단어만 덜렁 있는 줄(예: "Manufacturer")은 값이 아니라 다음 줄이 진짜 값이다.
const LABEL_WORD_ONLY_RE = /^(manufacturer|supplier|distributor|제조자|공급자|제조사|공급업체)\s*$/i;
// 라벨과 값이 콜론 없이 한 줄에 붙어있는 경우 (예: "1.2 Manufacturer Name JFE Steel Corp., ...").
// 일본/영문 MSDS에서 자주 보이는 형식 — 앞의 두 패턴이 콜론을 요구해서 놓친다.
const NO_COLON_INLINE_RE = /Manufacturer(?:'s)?\s+(?:Name\s+)?([A-Z가-힣][^\n]{2,})/;

function cleanName(raw: string): string {
  return raw
    .replace(/^[-•]\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/[,，]\s*$/, "")
    .trim();
}

/**
 * MSDS 1장에서 제조사/공급자명을 best-effort로 추출한다.
 * 문서 포맷이 매우 다양해(국문/영문, 라벨-값 같은줄/다음줄) 완벽히 맞지 않을 수 있으므로
 * 검토화면에서 반드시 확인/수정하는 것을 전제로 한다.
 */
export function extractManufacturerFromLines(lines: PdfLine[]): string | null {
  const searchLines = lines.slice(0, SEARCH_LINE_LIMIT);

  // 1차: 확실한 라벨과 값이 같은 줄에 있는 경우 (예: "Company : Hyundai Steel Company")
  for (const line of searchLines) {
    const m = STRONG_INLINE_RE.exec(line.text);
    if (m && cleanName(m[1]).length > 1) return cleanName(m[1]);
  }

  // 2차: 단순 "Name:" (단, "Product name:"/"Trade name:" 같은 다른 라벨의 일부가 아닐 때만)
  for (const line of searchLines) {
    if (NAME_FALSE_POSITIVE_RE.test(line.text)) continue;
    const m = NAME_ONLY_INLINE_RE.exec(line.text);
    if (m && cleanName(m[1]).length > 1) return cleanName(m[1]);
  }

  // 2.5차: 콜론 없이 "Manufacturer Name 값"이 붙어있는 경우
  for (const line of searchLines) {
    const m = NO_COLON_INLINE_RE.exec(line.text);
    if (m && cleanName(m[1]).length > 1) return cleanName(m[1]);
  }

  // 3차: 라벨만 있고 값은 다음 줄(들)에 있는 경우 — 값 자리에 또 라벨 단어만 있으면 건너뛴다
  // (예: "1.3. Supplier" -> "Manufacturer"(건너뜀) -> "ARC Metals, Hoeganaes Corporation").
  for (let i = 0; i < searchLines.length; i++) {
    if (!LABEL_ONLY_RE.test(searchLines[i].text)) continue;
    for (let j = i + 1; j < Math.min(i + 4, searchLines.length); j++) {
      const candidate = cleanName(searchLines[j].text);
      if (candidate === "" || NON_VALUE_RE.test(candidate) || LABEL_WORD_ONLY_RE.test(candidate)) continue;
      return candidate;
    }
  }

  return null;
}
