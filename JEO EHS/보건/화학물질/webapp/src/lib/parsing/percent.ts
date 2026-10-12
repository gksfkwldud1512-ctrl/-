export type ParsedPercent = {
  min: number | null;
  max: number | null;
  compare: number | null; // 판정에 사용할 값 (범위면 상한값)
  // "< 5", "3 - < 5", "Less than 5"처럼 상한 자체는 포함하지 않는 표기(실제 값 < compare)
  compareExclusive: boolean;
};

/**
 * PDF 줄 텍스트에서 함유량으로 볼 만한 부분 문자열을 찾기 위한 패턴.
 * 유럽식 콤마 소수점("1-9,99")과 부등호 표기(≥97%, ≤0.8%)를 쓰는 제조사(Hoganas 등)가
 * 실제로 있어 함께 지원한다. section3.ts의 성분표 행 재구성에서도 이 패턴을 재사용한다.
 */
// 화학식 아래첨자(예: "H3BO3", "C36H74O4Zn")의 숫자가 함유량으로 오인되지 않도록,
// 숫자 바로 앞에 알파벳이 붙어있는 경우(글자 뒤에 바로 오는 숫자)는 제외한다.
export const PERCENT_LIKE_RE =
  /(?:less\s+than\s*|under\s+|below\s+)?[≥≤<>~]?\s*(?<![A-Za-z])\d+(?:[.,]\d+)?\s*(?:[~～\-–―]\s*[≥≤<>~]?\s*\d+(?:[.,]\d+)?)?\s*%?|잔량|Bal\.?|To\s*100/i;

function toNumber(raw: string): number {
  return parseFloat(raw.replace(",", "."));
}

/**
 * MSDS 구성성분표의 함유량 문자열을 파싱한다.
 * "10~30", "10-30%", "10 - 30 %", "1-9,99"(콤마 소수점) 같은 범위와
 * "25%", "≥97%" 같은 단일값을 모두 지원한다.
 *
 * 범위인 경우 비교값(compare)은 상한(max)을 사용한다. 함유량 범위는 통상 실제
 * 조성을 숨기기 위해 공개되므로, 상한을 기준으로 판정해야 위음성(유해물질 누락)을
 * 방지할 수 있다 — 위양성(과잉판정)보다 위음성이 훨씬 위험하기 때문이다.
 */
export function parsePercent(rawText: string | null | undefined): ParsedPercent {
  const none: ParsedPercent = { min: null, max: null, compare: null, compareExclusive: false };
  if (!rawText || rawText.trim() === "") return none;

  const text = rawText.trim();
  const NUM = String.raw`(\d+(?:[.,]\d+)?)`;

  const range = new RegExp(NUM + String.raw`\s*%?\s*[~～\-–―]\s*([<≤]?)\s*` + NUM).exec(text);
  if (range) {
    const a = toNumber(range[1]);
    const b = toNumber(range[3]);
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    // "3 - < 10" : 상한(10) 미만
    return { min, max, compare: max, compareExclusive: range[2] === "<" };
  }

  const single = new RegExp(String.raw`(less\s*than|under|below|[<≤>≥]|)\s*` + NUM, "i").exec(text);
  if (single) {
    const v = toNumber(single[2]);
    const op = single[1].toLowerCase();
    if (op === "<" || /^(less|under|below)/.test(op)) return { min: null, max: v, compare: v, compareExclusive: true };
    if (op === "≤") return { min: null, max: v, compare: v, compareExclusive: false };
    // "> 97", "≥ 97" : 하한만 알려진 값 → 상한을 모르므로 보수적으로 100%까지 가능하다고 본다.
    if (op === ">" || op === "≥") return { min: v, max: 100, compare: 100, compareExclusive: false };
    return { min: v, max: v, compare: v, compareExclusive: false };
  }

  return none;
}
