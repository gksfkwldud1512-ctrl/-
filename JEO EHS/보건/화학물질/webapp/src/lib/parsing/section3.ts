import { extractPdfTextItems, groupIntoLines } from "./pdfText";
import { parsePercent } from "./percent";
import { extractManufacturerFromLines } from "./manufacturer";
import { extractRevisionInfoFromLines } from "./msdsRevision";
import { extractPpeTextFromLines } from "./ppe";
import { extractSection3FromLines, type DraftIngredient } from "./section3Lines";

export type { DraftIngredient };
export { extractSection3FromLines };

/** PDF 파일 버퍼로부터 구성성분표 초안을 추출하는 최상위 함수. */
export async function parseMsdsSection3(fileBuffer: Buffer): Promise<DraftIngredient[]> {
  const items = await extractPdfTextItems(fileBuffer);
  const lines = groupIntoLines(items);
  return extractSection3FromLines(lines);
}

/** PDF 파일 버퍼로부터 구성성분표 초안 + 제조사(1장) + 개정일/재검토주기 + 보호구(8장)를 한 번에 추출한다. */
export async function parseMsdsDocument(fileBuffer: Buffer): Promise<{
  ingredients: DraftIngredient[];
  manufacturer: string | null;
  revisionDate: string | null;
  reviewCycleYears: number | null;
  ppeText: string | null;
}> {
  const items = await extractPdfTextItems(fileBuffer);
  const lines = groupIntoLines(items);
  const revisionInfo = extractRevisionInfoFromLines(lines);
  return {
    ingredients: extractSection3FromLines(lines),
    manufacturer: extractManufacturerFromLines(lines),
    revisionDate: revisionInfo.revisionDate,
    reviewCycleYears: revisionInfo.reviewCycleYears,
    ppeText: extractPpeTextFromLines(lines),
  };
}

export { parsePercent };
