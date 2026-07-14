import path from "node:path";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { referenceSubstances, type CategoryRefCodes } from "@/lib/db/schema";
import { parseThresholdText } from "@/lib/parsing/threshold";

const REFERENCE_DIR = path.join(process.cwd(), "data", "reference");

// 파일명 -> 이 물질이 "어느 카테고리 파일에서 왔는지"를 나타내는 라벨
const SOURCE_FILES: { file: string; category: string }[] = [
  { file: "사고대비물질.xlsx", category: "사고대비" },
  { file: "인체등유해성물질.xlsx", category: "인체유해성" },
  { file: "잔류성오염물질.xlsx", category: "잔류성오염" },
  { file: "제한금지허가물질.xlsx", category: "제한금지허가" },
  { file: "중점관리물질.xlsx", category: "중점관리" },
];

// 행 안의 '사고대비/제한금지허가/중점/잔류' 참조코드 컬럼 (7,8,9,10번째 컬럼)
const REF_CODE_COLUMNS: { col: number; key: string }[] = [
  { col: 7, key: "사고대비" },
  { col: 8, key: "제한금지허가" },
  { col: 9, key: "중점" },
  { col: 10, key: "잔류" },
];

const CAS_RE = /^\d{1,7}-\d{2}-\d$/;

function splitCasNumbers(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const text = String(raw).trim();
  if (text === "" || text === "-" || text.includes("부여되지 않음")) return [];
  return text
    .split(/[,&]/)
    .map((s) => s.trim())
    .filter((s) => CAS_RE.test(s));
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in (value as object)) {
    return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  return String(value).trim();
}

type MergedRecord = {
  casNo: string;
  nameEn: string;
  nameKr: string;
  existingCode: string;
  hazardClassRaw: string;
  sourceCategories: Set<string>;
  categoryRefCodes: CategoryRefCodes;
  thresholdRaw: string;
  registrationNo: string;
  existingSubstanceYn: boolean | null;
};

export type SeedSummary = {
  totalRows: number;
  skippedNoCas: number;
  uniqueCas: number;
  unparsedThresholdBlocks: number;
};

export async function seedReferenceData(
  log: (msg: string) => void = () => {}
): Promise<SeedSummary> {
  const merged = new Map<string, MergedRecord>();
  let skippedNoCas = 0;
  let totalRows = 0;

  for (const { file, category } of SOURCE_FILES) {
    const filePath = path.join(REFERENCE_DIR, file);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.worksheets[0];

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // header
      totalRows++;

      const rawCas = cellText(row.getCell(2).value);
      const casNumbers = splitCasNumbers(rawCas);
      if (casNumbers.length === 0) {
        skippedNoCas++;
        return;
      }

      const nameEn = cellText(row.getCell(3).value);
      const nameKr = cellText(row.getCell(4).value);
      const existingCode = cellText(row.getCell(5).value);
      const hazardClassRaw = cellText(row.getCell(6).value);
      const thresholdRaw = cellText(row.getCell(11).value);
      const registrationNo = cellText(row.getCell(12).value);
      const existingYnText = cellText(row.getCell(13).value);
      const existingSubstanceYn = existingYnText === "" ? null : existingYnText.toUpperCase() === "Y";

      const refCodes: CategoryRefCodes = {};
      for (const { col, key } of REF_CODE_COLUMNS) {
        const v = cellText(row.getCell(col).value);
        if (v !== "") refCodes[key] = v;
      }

      for (const casNo of casNumbers) {
        const existing = merged.get(casNo);
        if (!existing) {
          merged.set(casNo, {
            casNo,
            nameEn,
            nameKr,
            existingCode,
            hazardClassRaw,
            sourceCategories: new Set([category]),
            categoryRefCodes: refCodes,
            thresholdRaw,
            registrationNo,
            existingSubstanceYn,
          });
        } else {
          existing.sourceCategories.add(category);
          existing.nameEn ||= nameEn;
          existing.nameKr ||= nameKr;
          existing.existingCode ||= existingCode;
          existing.hazardClassRaw ||= hazardClassRaw;
          existing.thresholdRaw ||= thresholdRaw;
          existing.registrationNo ||= registrationNo;
          if (existing.existingSubstanceYn === null) {
            existing.existingSubstanceYn = existingSubstanceYn;
          }
          for (const [k, v] of Object.entries(refCodes)) {
            if (!existing.categoryRefCodes[k]) existing.categoryRefCodes[k] = v;
          }
        }
      }
    });
  }

  log(`총 ${totalRows}행 처리, CAS 없음/무효 ${skippedNoCas}행 제외, 고유 CAS ${merged.size}건`);

  let unparsedTotal = 0;
  const records = Array.from(merged.values()).map((r) => {
    const { thresholds, unparsedBlocks } = parseThresholdText(r.thresholdRaw);
    unparsedTotal += unparsedBlocks.length;
    if (unparsedBlocks.length > 0) {
      log(`[threshold 파싱 실패] CAS ${r.casNo}: ${JSON.stringify(unparsedBlocks)}`);
    }
    return {
      casNo: r.casNo,
      nameEn: r.nameEn || null,
      nameKr: r.nameKr || null,
      existingCode: r.existingCode || null,
      hazardClassRaw: r.hazardClassRaw || null,
      sourceCategories: Array.from(r.sourceCategories),
      categoryRefCodes: r.categoryRefCodes,
      thresholdRaw: r.thresholdRaw || null,
      thresholds,
      registrationNo: r.registrationNo || null,
      existingSubstanceYn: r.existingSubstanceYn,
    };
  });

  log(`threshold 파싱 실패 블록: ${unparsedTotal}건`);

  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    await db
      .insert(referenceSubstances)
      .values(chunk)
      .onConflictDoUpdate({
        target: referenceSubstances.casNo,
        set: {
          nameEn: sql`excluded.name_en`,
          nameKr: sql`excluded.name_kr`,
          existingCode: sql`excluded.existing_code`,
          hazardClassRaw: sql`excluded.hazard_class_raw`,
          sourceCategories: sql`excluded.source_categories`,
          categoryRefCodes: sql`excluded.category_ref_codes`,
          thresholdRaw: sql`excluded.threshold_raw`,
          thresholds: sql`excluded.thresholds`,
          registrationNo: sql`excluded.registration_no`,
          existingSubstanceYn: sql`excluded.existing_substance_yn`,
        },
      });
    log(`upsert ${Math.min(i + CHUNK, records.length)}/${records.length}`);
  }

  return {
    totalRows,
    skippedNoCas,
    uniqueCas: merged.size,
    unparsedThresholdBlocks: unparsedTotal,
  };
}
