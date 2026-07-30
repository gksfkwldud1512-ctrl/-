import { NextResponse } from "next/server";
import { loadComplianceData, saveComplianceTasks, type ChecklistTask, type EvidenceFile } from "@/lib/complianceData";
import { COMPLIANCE_CATEGORIES } from "@/lib/complianceItems";

export async function GET() {
  const data = await loadComplianceData();
  return NextResponse.json(data);
}

function toEvidenceFile(v: unknown): EvidenceFile | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== "string" || typeof o.url !== "string" || typeof o.uploadedAt !== "string") return null;
  return { name: o.name, url: o.url, uploadedAt: o.uploadedAt };
}

function toTask(v: unknown): ChecklistTask | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.text !== "string") return null;
  const evidenceFiles = Array.isArray(o.evidenceFiles) ? (o.evidenceFiles.map(toEvidenceFile).filter((e): e is EvidenceFile => !!e)) : [];
  return {
    id: o.id,
    text: o.text,
    // 엄격 모드: 증빙 파일이 1개 이상 없으면 서버에서도 done=false로 강제한다(클라이언트 우회 방지).
    done: o.done === true && evidenceFiles.length > 0,
    completedAt: typeof o.completedAt === "string" ? o.completedAt : null,
    lastCheckedAt: typeof o.lastCheckedAt === "string" ? o.lastCheckedAt : null,
    note: typeof o.note === "string" ? o.note : "",
    evidenceFiles,
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("tasks" in body)) {
    return NextResponse.json({ error: "tasks 데이터가 필요합니다." }, { status: 400 });
  }
  const rawTasks = (body as { tasks: unknown }).tasks;
  if (!rawTasks || typeof rawTasks !== "object") {
    return NextResponse.json({ error: "tasks 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const cleanTasks: Record<string, ChecklistTask[]> = {};
  const validIds = new Set(COMPLIANCE_CATEGORIES.map((c) => c.id));
  for (const [categoryId, list] of Object.entries(rawTasks as Record<string, unknown>)) {
    if (!validIds.has(categoryId) || !Array.isArray(list)) continue;
    cleanTasks[categoryId] = list.map(toTask).filter((t): t is ChecklistTask => !!t);
  }
  for (const c of COMPLIANCE_CATEGORIES) {
    if (!cleanTasks[c.id]) cleanTasks[c.id] = [];
  }

  const saved = await saveComplianceTasks(cleanTasks);
  return NextResponse.json(saved);
}
