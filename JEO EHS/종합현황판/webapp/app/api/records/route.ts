import { NextResponse } from "next/server";
import { loadRecords, saveRecords } from "@/lib/store";
import type { RecordFile, TaskRecord } from "@/lib/types";
import { TASK_CATALOG } from "@/lib/taskCatalog";

export const dynamic = "force-dynamic";

function toFiles(v: unknown): RecordFile[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>) : null))
    .filter((f): f is Record<string, unknown> => !!f && typeof f.name === "string" && typeof f.path === "string")
    .map((f) => ({ name: f.name as string, path: f.path as string }));
}

/** 완료 기록 저장(업무×연×월당 1건, 같은 칸을 다시 저장하면 덮어쓴다). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const taskId = String(body.taskId ?? "");
  const year = Number(body.year);
  const month = Number(body.month);
  const isDynamic = taskId.startsWith("edu:");
  if (!taskId || (!isDynamic && !TASK_CATALOG.some((t) => t.id === taskId))) {
    return NextResponse.json({ error: "알 수 없는 업무입니다." }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "연/월이 올바르지 않습니다." }, { status: 400 });
  }
  const status = body.status === "na" ? "na" : "done";
  const doneDate = typeof body.doneDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.doneDate) ? body.doneDate : null;

  const record: TaskRecord = {
    id: `${taskId}__${year}-${String(month).padStart(2, "0")}`,
    taskId,
    year,
    month,
    status,
    doneDate,
    by: typeof body.by === "string" ? body.by.slice(0, 50) : "",
    note: typeof body.note === "string" ? body.note.slice(0, 2000) : "",
    files: toFiles(body.files),
    at: new Date().toISOString(),
  };

  const records = (await loadRecords()).filter((r) => r.id !== record.id);
  records.push(record);
  await saveRecords(records);
  return NextResponse.json({ ok: true, record });
}

/** 기록 삭제(완료 취소) — body: { id } */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  const records = await loadRecords();
  await saveRecords(records.filter((r) => r.id !== body.id));
  return NextResponse.json({ ok: true });
}
