import { put, get } from "@vercel/blob";
import { COMPLIANCE_CATEGORIES } from "./complianceItems";

export type EvidenceFile = { name: string; url: string; uploadedAt: string };

export type ChecklistTask = {
  id: string;
  text: string;
  done: boolean;
  completedAt: string | null;
  lastCheckedAt: string | null;
  note: string;
  evidenceFiles: EvidenceFile[];
};

export type ComplianceData = {
  updatedAt: string;
  tasks: Record<string, ChecklistTask[]>;
};

export type ComplianceCategoryStat = {
  id: string;
  ratePct: number | null; // applicable=false면 null("해당없음")
  doneCount: number;
  totalCount: number;
  overdue: boolean; // checkCycle이 있는데 반기(6개월) 이상 점검이 없는 경우
};

const DATA_PATH = "compliance/checklist.json";
const CHECK_CYCLE_MONTHS = 6;

function emptyTasks(): Record<string, ChecklistTask[]> {
  const tasks: Record<string, ChecklistTask[]> = {};
  for (const c of COMPLIANCE_CATEGORIES) tasks[c.id] = [];
  return tasks;
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function loadComplianceData(): Promise<ComplianceData> {
  try {
    const result = await get(DATA_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return { updatedAt: "", tasks: emptyTasks() };
    const text = (await streamToBuffer(result.stream as ReadableStream<Uint8Array>)).toString("utf-8");
    const parsed = JSON.parse(text) as ComplianceData;
    if (!parsed.tasks) parsed.tasks = emptyTasks();
    for (const c of COMPLIANCE_CATEGORIES) {
      if (!parsed.tasks[c.id]) parsed.tasks[c.id] = [];
    }
    return parsed;
  } catch {
    return { updatedAt: "", tasks: emptyTasks() };
  }
}

export async function saveComplianceTasks(tasks: Record<string, ChecklistTask[]>): Promise<ComplianceData> {
  const next: ComplianceData = { updatedAt: new Date().toISOString(), tasks };
  await put(DATA_PATH, JSON.stringify(next), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return next;
}

/** 항목별 이행율(%)·초과 점검기한 여부를 계산한다. applicable=false 항목은 ratePct=null로 반환한다. */
export function computeComplianceStats(data: ComplianceData): ComplianceCategoryStat[] {
  const now = Date.now();
  return COMPLIANCE_CATEGORIES.map((cat) => {
    const list = data.tasks[cat.id] ?? [];
    if (!cat.applicable) {
      return { id: cat.id, ratePct: null, doneCount: 0, totalCount: list.length, overdue: false };
    }
    const totalCount = list.length;
    const doneCount = list.filter((t) => t.done).length;
    const ratePct = totalCount > 0 ? Math.round((doneCount / totalCount) * 1000) / 10 : 0;

    let overdue = false;
    if (cat.checkCycle) {
      const lastChecks = list.map((t) => t.lastCheckedAt).filter((d): d is string => !!d);
      if (lastChecks.length === 0) {
        overdue = totalCount > 0; // 세부 항목은 있는데 점검 기록이 한 번도 없으면 초과로 간주
      } else {
        const mostRecent = Math.max(...lastChecks.map((d) => new Date(d).getTime()));
        const monthsSince = (now - mostRecent) / (1000 * 60 * 60 * 24 * 30);
        overdue = monthsSince >= CHECK_CYCLE_MONTHS;
      }
    }
    return { id: cat.id, ratePct, doneCount, totalCount, overdue };
  });
}

/** 적용대상(applicable=true) 항목들의 이행율 단순 평균. */
export function computeOverallRate(stats: ComplianceCategoryStat[]): number {
  const applicable = stats.filter((s) => s.ratePct !== null);
  if (applicable.length === 0) return 0;
  const sum = applicable.reduce((acc, s) => acc + (s.ratePct ?? 0), 0);
  return Math.round((sum / applicable.length) * 10) / 10;
}
