import { NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/store";
import type { TaskSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 업무별 설정 저장 — body: { taskId, patch: { enabled?, months?, anchor?, verified? } } (anchor: null이면 삭제) */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { taskId?: string; patch?: Record<string, unknown> } | null;
  if (!body?.taskId || !body.patch) return NextResponse.json({ error: "taskId/patch가 필요합니다." }, { status: 400 });

  const settings = await loadSettings();
  const cur: TaskSettings = { ...(settings[body.taskId] ?? {}) };
  const p = body.patch;

  if (typeof p.enabled === "boolean") cur.enabled = p.enabled;
  if (typeof p.verified === "boolean") cur.verified = p.verified;
  if (Array.isArray(p.months)) {
    const months = (p.months as unknown[]).map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
    if (months.length > 0) cur.months = [...new Set(months)].sort((a, b) => a - b);
  }
  if ("anchor" in p) {
    const a = p.anchor as { year?: unknown; month?: unknown } | null;
    if (a === null) delete cur.anchor;
    else if (a && Number.isInteger(a.year) && Number.isInteger(a.month) && (a.month as number) >= 1 && (a.month as number) <= 12) {
      cur.anchor = { year: a.year as number, month: a.month as number };
    }
  }

  settings[body.taskId] = cur;
  await saveSettings(settings);
  return NextResponse.json({ ok: true, settings: cur });
}
