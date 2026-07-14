import type { ParsedThreshold, ThresholdOperator } from "@/lib/db/schema";

/**
 * '유해특성분류 및 혼합물 함량기준(%)' 원문 텍스트를 구조화된 threshold 배열로 파싱한다.
 *
 * 텍스트는 " / "로 구분된 블록들로 구성되고, 각 블록은 "<분류> : <내용>" 형태다.
 * - Type A (유독물질류): 내용이 "서브라벨 : 10%, 서브라벨2 : 0.1%" 처럼 반복되고
 *   "이상"/"초과" 단어가 없음 -> 서브라벨마다 개별 threshold, 연산자는 관례상 '>=' (추정).
 * - Type B (사고대비/금지/제한물질류): 내용에 "25% 이상 함유한 혼합물"처럼 퍼센트+연산어가
 *   포함됨 -> "초과"면 '>', 아니면 '>='.
 *
 * 두 패턴 모두에 해당하지 않는 블록은 조용히 버리지 않고 unparsed 목록에 남긴다.
 */
export function parseThresholdText(raw: string | null | undefined): {
  thresholds: ParsedThreshold[];
  unparsedBlocks: string[];
} {
  const thresholds: ParsedThreshold[] = [];
  const unparsedBlocks: string[] = [];

  if (!raw || raw.trim() === "") {
    return { thresholds, unparsedBlocks };
  }

  const blocks = raw
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const categoryMatch = /^([\s\S]+?)\s*:\s*([\s\S]+)$/.exec(block);
    if (!categoryMatch) {
      unparsedBlocks.push(block);
      continue;
    }
    const [, category, rest] = categoryMatch;
    const hasOpWord = /이상|초과/.test(rest);

    const typeAMatches = [...rest.matchAll(/([^,:]+?)\s*:\s*([\d.]+)\s*%/g)];

    if (typeAMatches.length > 0 && !hasOpWord) {
      for (const m of typeAMatches) {
        const subLabel = m[1].trim();
        const percent = parseFloat(m[2]);
        if (Number.isNaN(percent)) continue;
        thresholds.push({
          category: category.trim(),
          subcategory: subLabel,
          operator: ">=" as ThresholdOperator,
          percent,
          raw: block,
        });
      }
      continue;
    }

    const opMatch = /(\d+(?:\.\d+)?)\s*%\s*(이상|초과)/.exec(rest);
    if (opMatch) {
      const percent = parseFloat(opMatch[1]);
      const operator: ThresholdOperator = opMatch[2] === "초과" ? ">" : ">=";
      thresholds.push({
        category: category.trim(),
        subcategory: null,
        operator,
        percent,
        raw: block,
      });
      continue;
    }

    unparsedBlocks.push(block);
  }

  return { thresholds, unparsedBlocks };
}
