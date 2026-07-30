import { extractPdfTextItems, groupIntoLines, type PdfLine } from "./pdfText";
import { parsePercent, PERCENT_LIKE_RE } from "./percent";
import { extractManufacturerFromLines } from "./manufacturer";

export type DraftIngredient = {
  ingredientName: string;
  casNo: string | null;
  contentPercentRaw: string | null;
};

const CAS_RE = /\b\d{2,7}-\d{2}-\d\b/;
// EU CLP 색인번호(Index number, 예: "008-001-00-8")는 자릿수 구성이 CAS번호와
// 비슷해 CAS_RE에 부분적으로 걸릴 수 있어, 이 라벨이 붙은 줄은 앵커 대상에서 제외한다.
const INDEX_NUMBER_LINE_RE = /^\s*(?:index\s*number|지수\s*번호|색인\s*번호)\b/i;
// EINECS/EC번호(예: "231-096-4")도 자릿수 구성이 함유량 범위처럼 보여 오인식되므로
// 함유량 탐색 전에 미리 같은 길이의 공백으로 지워 둔다(인덱스 정합성 유지).
const EINECS_LIKE_RE = /\b\d{3}-\d{3}-\d\b/g;

// 실제 수집된 MSDS 33건을 검토해 확인한 표기 변형들을 모두 지원한다:
// - "구성성분의 명칭 및 함유량" / "구성 성분의 조성/정보"(Hoganas 계열) / "화학물질의 명칭 및 함유량"
// - 영문 "Composition/information on ingredients" (SECTION 3: 접두, 볼드 중복 텍스트 등 포함해도 부분일치로 탐지)
// 번호 접두사(3./３．/SECTION 3:)는 굳이 요구하지 않는다 — 전각 숫자, 중복 렌더링 등으로
// 접두 매칭이 자주 깨지기 때문에 핵심 키워드 포함 여부만 본다.
const START_RE =
  /구성\s*성분\s*의?\s*(?:명칭\s*및\s*함유량|조성\s*\/?\s*정보)|화학물질\s*의?\s*명칭\s*및\s*함유량|composition\s*\/?\s*information\s*on\s*ingredients|information\s*of\s*chemical\s*composition/i;

// 성분표 행 앞에 붙는 "2.2" 같은 소절 번호가 함유량(%)으로 오인되지 않도록, CAS 앞부분에서
// 퍼센트/이름을 찾기 전에 먼저 잘라낸다.
const LEADING_SUBSECTION_NUMBER_RE = /^\s*\d{1,2}\.\d{1,2}\s+/;

// "응급조치 요령" / "응급 조치 요령"(공백 변형) / 영문 "First-aid measures"/"First aid measures"
const END_RE = /응급\s*조치\s*요령|응급조치|first[- ]?aid\s*measures/i;

/** 섹션3(구성성분 표) 라인 구간을 잘라낸다. 시작 마커를 못 찾으면 문서 전체를 대상으로 한다. */
function sliceSection3Lines(lines: PdfLine[]): PdfLine[] {
  let startIdx = 0;
  const foundStart = lines.findIndex((l) => START_RE.test(l.text));
  if (foundStart !== -1) startIdx = foundStart + 1;

  let endIdx = lines.length;
  for (let i = startIdx; i < lines.length; i++) {
    if (END_RE.test(lines[i].text)) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx);
}

/** "CAS:", "CAS-No.", "EINECS: 231-096-4" 같은 라벨/부등호 찌꺼기를 성분명에서 제거한다. */
function cleanIngredientName(raw: string): string {
  return raw
    .replace(LEADING_SUBSECTION_NUMBER_RE, "")
    .replace(/\b(?:Ingredients?|성분명?|화학물질명)\s*[:.]?\s*/gi, " ")
    .replace(/\bCAS[\s-]*(?:No\.?|번호)?\s*[:.]?/gi, " ")
    .replace(/\bEINECS[\s-]*(?:No\.?)?\s*[:.]?\s*\d{2,3}-\d{3}-\d\b/gi, " ")
    .replace(/[≥≤<>~～]/g, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,:;.\-/]+|[\s,:;.\-/]+$/g, "")
    // "noneIron"처럼 PDF에서 체크박스성 "none"이 성분명에 공백 없이 붙어 나오는 경우 제거.
    .replace(/^none(?=[A-Z가-힣])/i, "")
    // "Iron (CAS-No. : ..."에서 CAS 라벨을 지우고 남는 짝 안 맞는 여는 괄호 제거.
    .replace(/\(\s*$/, "")
    .trim();
}

/** EINECS/EC번호처럼 함유량으로 오인되기 쉬운 구간을 같은 길이의 공백으로 지운다(인덱스 보존). */
function blankOutEinecsLike(text: string): string {
  return text.replace(EINECS_LIKE_RE, (m) => " ".repeat(m.length));
}

/**
 * 같은 CAS번호가 섹션 경계 오탐 등으로 여러 행 생성됐을 때(예: 독성정보 항목에서
 * 같은 물질이 참조용으로 재언급되는 경우) 중복을 제거하고, 함유량 정보가 더
 * 완전한 행을 우선 채택한다.
 */
function dedupeByCas(drafts: DraftIngredient[]): DraftIngredient[] {
  const order: string[] = [];
  const best = new Map<string, DraftIngredient>();

  drafts.forEach((d, idx) => {
    const key = d.casNo ?? `__nocas_${idx}`;
    const existing = best.get(key);
    if (!existing) {
      order.push(key);
      best.set(key, d);
    } else if (!existing.contentPercentRaw && d.contentPercentRaw) {
      best.set(key, d);
    }
  });

  return order.map((k) => best.get(k)!);
}

/**
 * CAS 번호가 등장하는 각 라인을 성분 1행의 앵커로 삼아 구성성분표를 재구성한다.
 *
 * 한계: 다줄 성분명(라벨과 값이 다른 줄에 있는 경우), 병합 셀, 스캔 이미지형 PDF는
 * 정확히 분리되지 않을 수 있다. 이 결과는 반드시 검토/수정 화면을 거친 뒤 확정해야 한다.
 */
function reconstructIngredients(sectionLines: PdfLine[]): DraftIngredient[] {
  const drafts: DraftIngredient[] = [];

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    if (INDEX_NUMBER_LINE_RE.test(line.text)) continue;

    const casMatch = CAS_RE.exec(line.text);
    if (!casMatch) continue;

    const casNo = casMatch[0];
    // "2.2 Ingredients : ..." 처럼 줄 맨 앞의 소절 번호가 함유량(%)으로 오인되지 않도록
    // 함유량/이름 추출 전에 미리 잘라낸다(라벨 텍스트는 cleanIngredientName에서 별도 제거).
    const beforeCas = line.text.slice(0, casMatch.index).replace(LEADING_SUBSECTION_NUMBER_RE, "");
    const afterCas = line.text.slice(casMatch.index + casNo.length);
    // EINECS/EC번호가 함유량으로 오인되지 않도록 검색용 사본에서만 지운다(이름 추출은 원문 사용).
    const beforeCasForPercent = blankOutEinecsLike(beforeCas);
    const afterCasForPercent = blankOutEinecsLike(afterCas);

    // 함유량은 CAS 앞(예: "Iron [Fe] bal 7439-89-6")이나 뒤(예: "니켈 7440-02-0 1-9,99 ...")
    // 어느 쪽에도 올 수 있어 양쪽을 다 찾아보되, 어느 쪽에서 찾았는지를 성분명 추출에 반영한다.
    const percentInBefore = PERCENT_LIKE_RE.exec(beforeCasForPercent);
    const percentInAfter = PERCENT_LIKE_RE.exec(afterCasForPercent);
    const percentMatch = percentInBefore ?? percentInAfter;
    const contentPercentRaw = percentMatch ? percentMatch[0].trim() : null;

    let namePart: string;
    if (percentInBefore) {
      // "Iron [Fe] bal 7439-89-6" 형태: 함유량을 뺀 CAS 앞부분이 이름
      namePart = cleanIngredientName(beforeCas.replace(percentInBefore[0], ""));
    } else {
      // "니켈 7440-02-0 1-9,99 STOT..." 형태: CAS 앞부분이 이름, 뒷부분은
      // 함유량 이후로 유해성분류 문구가 붙어있을 뿐이므로 이름에 포함하지 않는다.
      namePart = cleanIngredientName(beforeCas);
      if (namePart === "") {
        // "CAS: 7439-89-6 Iron ≥97%" 형태: 이름이 CAS 뒤, 함유량 앞에 위치
        const afterName = percentInAfter ? afterCas.slice(0, percentInAfter.index) : afterCas;
        namePart = cleanIngredientName(afterName);
      }
    }

    // 이름 부분이 비어있으면(값만 있는 줄이면) 바로 윗줄을 성분명 후보로 사용.
    // (한 글자짜리 원소명 "철"/"금" 등은 정상이므로 길이가 아니라 완전히 빈 경우만 대체한다.)
    if (namePart === "" && i > 0) {
      const prev = sectionLines[i - 1];
      if (!CAS_RE.test(prev.text)) {
        namePart = cleanIngredientName(prev.text);
      }
    }

    drafts.push({
      ingredientName: namePart || "(미확인)",
      casNo,
      contentPercentRaw,
    });
  }

  return dedupeByCas(drafts);
}

export function extractSection3FromLines(lines: PdfLine[]): DraftIngredient[] {
  const sectionLines = sliceSection3Lines(lines);
  return reconstructIngredients(sectionLines);
}

/** PDF 파일 버퍼로부터 구성성분표 초안을 추출하는 최상위 함수. */
export async function parseMsdsSection3(fileBuffer: Buffer): Promise<DraftIngredient[]> {
  const items = await extractPdfTextItems(fileBuffer);
  const lines = groupIntoLines(items);
  return extractSection3FromLines(lines);
}

/** PDF 파일 버퍼로부터 구성성분표 초안 + 제조사(1장)를 한 번에 추출한다. */
export async function parseMsdsDocument(
  fileBuffer: Buffer
): Promise<{ ingredients: DraftIngredient[]; manufacturer: string | null }> {
  const items = await extractPdfTextItems(fileBuffer);
  const lines = groupIntoLines(items);
  return {
    ingredients: extractSection3FromLines(lines),
    manufacturer: extractManufacturerFromLines(lines),
  };
}

export { parsePercent };
