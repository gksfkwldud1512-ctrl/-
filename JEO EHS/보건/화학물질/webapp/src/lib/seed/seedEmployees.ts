import path from "node:path";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";

const EMPLOYEE_FILE = path.join(process.cwd(), "data", "employees", "사원명부.xlsx");

// "D0511 (성형)" -> { code: "D0511", label: "성형" }
const POSITION_RE = /^(\S+)\s*\(([^)]+)\)\s*$/;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in (value as object)) {
    return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

export type SeedEmployeesSummary = {
  totalRows: number;
  skipped: number;
  inserted: number;
};

type EmployeeRecord = typeof employees.$inferInsert;

/**
 * xlsx 버퍼(사원명 | 사번 | 부서명 | 포지션 | 입사일, 1행 제목·2행 헤더)를 파싱해 레코드 배열로 만든다.
 * 웹 업로드(POST /api/employees/upload)와 CLI 시딩(npm run seed:employees) 양쪽에서 공유한다.
 */
export async function parseEmployeesWorkbook(
  buffer: Buffer,
  log: (msg: string) => void = () => {}
): Promise<{ records: EmployeeRecord[]; totalRows: number; skipped: number }> {
  const wb = new ExcelJS.Workbook();
  // exceljs의 Buffer 타입 선언이 이 프로젝트의 @types/node보다 더 넓은 버전을 요구해
  // 구조적으로 어긋난다(런타임 값은 동일한 Node Buffer) — 안전한 캐스트로 우회한다.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];

  const records: EmployeeRecord[] = [];
  let totalRows = 0;
  let skipped = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 2) return; // 1행 제목, 2행 헤더
    totalRows++;
    const name = cellText(row.getCell(1).value);
    const employeeNo = cellText(row.getCell(2).value);
    const department = cellText(row.getCell(3).value);
    const positionRaw = cellText(row.getCell(4).value);
    const hireDate = cellText(row.getCell(5).value);

    if (!name || !department) {
      skipped++;
      return;
    }

    const posMatch = POSITION_RE.exec(positionRaw);
    records.push({
      name,
      employeeNo: employeeNo || null,
      department,
      positionCode: posMatch ? posMatch[1] : null,
      positionLabel: posMatch ? posMatch[2] : positionRaw || null,
      hireDate: hireDate || null,
    });
  });

  log(`총 ${totalRows}행 처리, 제외 ${skipped}행, 적재 대상 ${records.length}건`);
  return { records, totalRows, skipped };
}

/** 사원명부 레코드로 employees 테이블을 통째로 교체한다(스냅샷 전체 교체 — 퇴사자 반영 등). */
export async function replaceEmployees(
  records: EmployeeRecord[],
  log: (msg: string) => void = () => {}
): Promise<void> {
  await db.delete(employees);

  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    await db.insert(employees).values(chunk).onConflictDoUpdate({
      target: employees.employeeNo,
      set: {
        name: sql`excluded.name`,
        department: sql`excluded.department`,
        positionCode: sql`excluded.position_code`,
        positionLabel: sql`excluded.position_label`,
        hireDate: sql`excluded.hire_date`,
      },
    });
    log(`upsert ${Math.min(i + CHUNK, records.length)}/${records.length}`);
  }
}

/** data/employees/사원명부.xlsx(저장소에 커밋된 스냅샷)로 CLI에서 재시딩한다. */
export async function seedEmployees(log: (msg: string) => void = () => {}): Promise<SeedEmployeesSummary> {
  const fs = await import("node:fs/promises");
  const buffer = await fs.readFile(EMPLOYEE_FILE);
  const { records, totalRows, skipped } = await parseEmployeesWorkbook(buffer, log);
  await replaceEmployees(records, log);
  return { totalRows, skipped, inserted: records.length };
}
