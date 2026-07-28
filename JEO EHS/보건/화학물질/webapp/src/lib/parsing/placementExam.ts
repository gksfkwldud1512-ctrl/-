import { extractPdfTextItems, groupIntoLines, type PdfLine } from "./pdfText";
import type { HazardGrade } from "@/lib/db/schema";

export type DraftPlacementExam = {
  name: string | null;
  age: number | null;
  gender: string | null;
  residentNumberMasked: string | null;
  department: string | null;
  workProcess: string | null;
  examDate: string | null;
  nextExamDate: string | null;
  hazardGrades: HazardGrade[];
  healthGradeWorst: string | null;
  opinionText: string | null;
};

const GRADE_CODES = ["D1", "D2", "C1", "C2", "CN", "R", "B", "A"] as const;
// 나쁜 순서(위)에서 좋은 순서(아래)로 정렬. 인덱스가 작을수록 나쁨.
const GRADE_SEVERITY: Record<string, number> = {
  D1: 0,
  D2: 1,
  R: 2,
  C1: 3,
  C2: 3,
  CN: 3,
  B: 4,
  A: 5,
};

function normalizeDate(raw: string): string | null {
  const m = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function findLine(lines: PdfLine[], re: RegExp): PdfLine | undefined {
  return lines.find((l) => re.test(l.text));
}

/** 문서 상단 "니켈 및 그 무기화합물,구리,산화철,..." 형태의 유해인자 콤마 목록 줄을 찾는다. */
function findHazardVocabLine(lines: PdfLine[]): string[] {
  const candidate = lines
    .slice(0, 6)
    .find((l) => l.text.includes(",") && !/\d/.test(l.text) && l.text.length > 3);
  if (!candidate) return [];
  return candidate.text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 한 페이지 분량의 "판정" 표 구간(검진소견/사후관리조치/유해인자/건강구분)에서 유해인자·등급 쌍을 추출한다. */
function extractHazardGradesFromPage(pageLines: PdfLine[], vocab: string[]): HazardGrade[] {
  const startIdx = pageLines.findIndex((l) => /검\s*진\s*소\s*견/.test(l.text));
  const endIdx = pageLines.findIndex((l) => /^검진일\s/.test(l.text));
  if (startIdx === -1) return [];
  const tableLines = pageLines.slice(startIdx + 1, endIdx === -1 ? pageLines.length : endIdx);

  const gradeAlt = GRADE_CODES.join("|");
  const results: HazardGrade[] = [];

  for (const line of tableLines) {
    for (const word of vocab) {
      if (word === "") continue;
      const re = new RegExp(
        `${escapeRegExp(word)}(?:\\([^)]*\\))?\\s+(${gradeAlt})\\b`
      );
      const m = re.exec(line.text);
      if (m) {
        results.push({ hazard: word, grade: m[1] });
      }
    }
  }
  return results;
}

/**
 * "판정" 표(유해인자별 검진소견/건강구분)는 항목 수가 많으면 다음 페이지로 이어진다.
 * 페이지마다 반복되는 "검 진 소 견 ~ 검진일" 헤더 구간을 각각 파싱해 이어붙여야
 * 두번째 페이지 이후의 유해인자 행이 누락되지 않는다.
 */
function extractHazardGrades(lines: PdfLine[]): HazardGrade[] {
  const vocab = Array.from(new Set([...findHazardVocabLine(lines), "사부담(채용검진)"]));
  const pages = Array.from(new Set(lines.map((l) => l.page))).sort((a, b) => a - b);
  const results: HazardGrade[] = [];
  for (const page of pages) {
    const pageLines = lines.filter((l) => l.page === page);
    results.push(...extractHazardGradesFromPage(pageLines, vocab));
  }
  return results;
}

function worstGrade(grades: HazardGrade[]): string | null {
  if (grades.length === 0) return null;
  let worst = grades[0].grade;
  let worstRank = GRADE_SEVERITY[worst] ?? 99;
  for (const g of grades) {
    const rank = GRADE_SEVERITY[g.grade] ?? 99;
    if (rank < worstRank) {
      worst = g.grade;
      worstRank = rank;
    }
  }
  return worst;
}

/** 한 페이지 분량의 "판정" 표 구간을 사람이 읽는 소견 텍스트로 이어붙인다. */
function extractOpinionTextFromPage(pageLines: PdfLine[]): string | null {
  const startIdx = pageLines.findIndex((l) => /검\s*진\s*소\s*견/.test(l.text));
  const endIdx = pageLines.findIndex((l) => /^검진일\s/.test(l.text));
  if (startIdx === -1) return null;
  const body = pageLines
    .slice(startIdx + 1, endIdx === -1 ? pageLines.length : endIdx)
    .map((l) => l.text.trim())
    .filter(Boolean);
  return body.length > 0 ? body.join("\n") : null;
}

/** 페이지마다 반복되는 "판정" 표 구간(검토화면에서 자유 수정 전제)을 모두 이어붙인다. */
function extractOpinionText(lines: PdfLine[]): string | null {
  const pages = Array.from(new Set(lines.map((l) => l.page))).sort((a, b) => a - b);
  const parts = pages
    .map((page) => extractOpinionTextFromPage(lines.filter((l) => l.page === page)))
    .filter((s): s is string => !!s);
  return parts.length > 0 ? parts.join("\n") : null;
}

export function extractPlacementExamFromLines(lines: PdfLine[]): DraftPlacementExam {
  const idLine = findLine(lines, /성\s*명.*주민등록번호/);
  let name: string | null = null;
  let residentNumberMasked: string | null = null;
  let age: number | null = null;
  let gender: string | null = null;
  if (idLine) {
    const m = idLine.text.match(
      /성\s*명\s+(\S+)\s+주민등록번호\s+(\S+)\s+나\s*이\s+(\d+)\s+성별\s+(\S+)/
    );
    if (m) {
      name = m[1];
      residentNumberMasked = m[2];
      age = Number(m[3]);
      gender = m[4];
    }
  }

  let department: string | null = null;
  let workProcess: string | null = null;
  const deptLine = findLine(lines, /현\s*부\s*서/);
  if (deptLine) {
    const m = deptLine.text.match(/현\s*부\s*서\s+(\S+)\s+현작업공정\s+(\S+)/);
    if (m) {
      department = m[1];
      workProcess = m[2];
    }
  }

  let examDate: string | null = null;
  const examLine = findLine(lines, /^검진일\s/) ?? findLine(lines, /검진일\s+[\d.]+/);
  if (examLine) {
    const m = examLine.text.match(/검진일\s+([\d.\-/]+)/);
    if (m) examDate = normalizeDate(m[1]);
  }

  let nextExamDate: string | null = null;
  const nextLine = findLine(lines, /차기\s*건강진단\s*예정일자/);
  if (nextLine) {
    const m = nextLine.text.match(
      /차기\s*건강진단\s*예정일자는\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/
    );
    if (m) nextExamDate = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }

  const hazardGrades = extractHazardGrades(lines);
  const opinionText = extractOpinionText(lines);

  return {
    name,
    age,
    gender,
    residentNumberMasked,
    department,
    workProcess,
    examDate,
    nextExamDate,
    hazardGrades,
    healthGradeWorst: worstGrade(hazardGrades),
    opinionText,
  };
}

/** 주민등록번호가 마스킹되지 않은 형태(13자리 전체)로 들어와도 뒷자리를 강제 마스킹한다. */
export function maskResidentNumber(raw: string | null): string | null {
  if (!raw) return raw;
  const trimmed = raw.trim();
  const full = trimmed.match(/^(\d{6})-?(\d)\d{6}$/);
  if (full) return `${full[1]}-${full[2]}******`;
  return trimmed; // 이미 마스킹되어 있거나(예: 910223-1******) 인식 불가 형식이면 그대로 둔다.
}

export async function parsePlacementExam(fileBuffer: Buffer): Promise<DraftPlacementExam> {
  const items = await extractPdfTextItems(fileBuffer);
  const lines = groupIntoLines(items);
  const draft = extractPlacementExamFromLines(lines);
  return { ...draft, residentNumberMasked: maskResidentNumber(draft.residentNumberMasked) };
}
