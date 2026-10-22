"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORY_LABEL } from "@/lib/types";
import type { AutoResult, CellStatus, RecordFile, TaskDef, TaskRecord, TaskSettings } from "@/lib/types";
import type { Today } from "@/lib/taskStatus";
import { isEnabledSimple } from "./modalHelpers";

const STATUS_TEXT: Record<CellStatus, string> = {
  none: "해당월 아님",
  na: "해당없음",
  done: "완료",
  due: "해당 (진행 필요)",
  overdue: "미실시 (기한 지남)",
  anchor: "기준월",
};
const STATUS_BADGE: Record<CellStatus, string> = {
  none: "bg-slate-100 text-slate-500",
  na: "bg-slate-200 text-slate-600",
  done: "bg-emerald-500 text-white",
  due: "bg-amber-300 text-amber-950",
  overdue: "bg-red-600 text-white",
  anchor: "bg-slate-200 text-slate-600",
};

export function TaskModal(props: {
  task: TaskDef;
  month: number;
  year: number;
  today: Today & { day: number };
  settings: TaskSettings | undefined;
  records: TaskRecord[];
  auto: AutoResult | undefined;
  status: CellStatus;
  onClose: () => void;
}) {
  const { task, month, year, today, settings, records, auto, status, onClose } = props;
  const router = useRouter();
  const enabled = isEnabledSimple(task, settings);

  const existing = records.find((r) => r.year === year && r.month === month);
  const todayStr = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  const [doneDate, setDoneDate] = useState(existing?.doneDate ?? todayStr);
  const [by, setBy] = useState(existing?.by ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [files, setFiles] = useState<RecordFile[]>(existing?.files ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [months, setMonths] = useState<number[]>(settings?.months ?? (task.cadence.kind === "months" ? task.cadence.months : []));
  const [anchor, setAnchor] = useState(settings?.anchor ? `${settings.anchor.year}-${String(settings.anchor.month).padStart(2, "0")}` : "");

  async function call(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "저장에 실패했습니다.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const saveRecord = (st: "done" | "na") =>
    call("/api/records", "POST", { taskId: task.id, year, month, status: st, doneDate: st === "done" ? doneDate : null, by, note, files });

  const saveSettings = (patch: Record<string, unknown>) => call("/api/settings", "POST", { taskId: task.id, patch });

  async function upload(list: FileList | null) {
    if (!list) return;
    setBusy(true);
    setError(null);
    try {
      const added: RecordFile[] = [];
      for (const f of Array.from(list)) {
        const form = new FormData();
        form.append("file", f);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "업로드 실패");
        added.push({ name: j.name, path: j.path });
      }
      setFiles((cur) => [...cur, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const sortedRecords = [...records].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="mt-6 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">
              {CATEGORY_LABEL[task.category]} · {task.role} · {task.cadence.label}
            </div>
            <h2 className="mt-0.5 text-lg font-bold">{task.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="닫기">
            ✕
          </button>
        </div>

        <dl className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
          <div>
            <dt className="inline font-semibold">법적 근거 </dt>
            <dd className="inline text-slate-700">{task.basis}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-red-700">과태료·벌칙 </dt>
            <dd className="inline text-slate-700">{task.penalty}</dd>
          </div>
          {task.note && (
            <div>
              <dt className="inline font-semibold">참고 </dt>
              <dd className="inline text-slate-700">{task.note}</dd>
            </div>
          )}
          {auto?.note && (
            <div>
              <dt className="inline font-semibold text-indigo-700">자동판정 </dt>
              <dd className="inline text-slate-700">{auto.note}</dd>
            </div>
          )}
          {auto?.error && <div className="text-slate-500">⚠ {auto.error}</div>}
          {task.link && (
            <a href={task.link} target="_blank" rel="noopener noreferrer" className="inline-block text-indigo-600 underline">
              해당 시스템 열기 →
            </a>
          )}
        </dl>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!settings?.verified}
            disabled={busy}
            onChange={(e) => saveSettings({ verified: e.target.checked })}
          />
          법령 근거·주기를 확인했습니다 (확인하면 &apos;법령 확인필요&apos; 표시가 사라집니다)
        </label>

        {/* 이 달 기록 */}
        <section className="mt-4 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">
              {year}년 {month}월
            </h3>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>{STATUS_TEXT[status]}</span>
          </div>

          {(

            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">완료일</span>
                <input type="date" value={doneDate} onChange={(e) => setDoneDate(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">담당자</span>
                <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="이름" className="rounded border border-slate-300 px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-slate-500">내용·메모 (실시 내용, 대상 인원, 결과 등)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="rounded border border-slate-300 px-2 py-1.5" />
              </label>
              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500">첨부 (결과서·사진·서명지 등, 파일당 10MB)</span>
                <input type="file" multiple disabled={busy} onChange={(e) => upload(e.target.files)} className="mt-1 block w-full text-xs" />
                {files.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {files.map((f) => (
                      <li key={f.path} className="flex items-center gap-2">
                        <a href={`/api/file?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">
                          {f.name}
                        </a>
                        <button type="button" onClick={() => setFiles((cur) => cur.filter((x) => x.path !== f.path))} className="text-slate-400 hover:text-red-600">
                          제거
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {error && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-red-700">{error}</p>}

          {enabled && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => (await saveRecord("done")) && onClose()}
                className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                완료로 기록
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => (await saveRecord("na")) && onClose()}
                className="rounded-md border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
              >
                이 달은 해당없음
              </button>
              {existing && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => (await call("/api/records", "DELETE", { id: existing.id })) && onClose()}
                  className="rounded-md border border-red-300 px-4 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  기록 삭제(완료 취소)
                </button>
              )}
            </div>
          )}
        </section>

        {/* 설정 */}
        <section className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
          <h3 className="font-semibold">업무 설정</h3>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={async () => (await saveSettings({ enabled: false })) && onClose()}
              className="rounded-md border border-red-300 px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              🗑 이 업무를 목록에서 삭제
            </button>
            <span className="text-xs text-slate-500">우리 사업장에 해당 없는 업무는 삭제하세요. &apos;삭제된 업무&apos; 탭에서 언제든 복원할 수 있습니다.</span>
          </div>

          {task.cadence.kind === "months" && (
            <div className="mt-3">
              <div className="text-xs text-slate-500">해당월 (여러 개 선택 가능)</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMonths((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))}
                    className={`h-7 w-9 rounded border text-xs ${months.includes(m) ? "border-amber-400 bg-amber-300 font-semibold" : "border-slate-300 bg-white"}`}
                  >
                    {m}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy || months.length === 0}
                  onClick={() => saveSettings({ months })}
                  className="ml-1 rounded bg-slate-800 px-3 text-xs text-white disabled:opacity-40"
                >
                  해당월 저장
                </button>
              </div>
            </div>
          )}

          {task.cadence.kind === "multiyear" && (
            <div className="mt-3">
              <div className="text-xs text-slate-500">
                대상월 — 다음 {task.cadence.years}년 주기 업무가 해당되는 달 (완료를 기록하면 완료한 달 + {task.cadence.years}년이 다음 해당월로 자동 설정)
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input type="month" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
                <button
                  type="button"
                  disabled={busy || !anchor}
                  onClick={() => {
                    const [y, m] = anchor.split("-").map(Number);
                    saveSettings({ anchor: { year: y, month: m } });
                  }}
                  className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-40"
                >
                  대상월 저장
                </button>
                {settings?.anchor && (
                  <button type="button" disabled={busy} onClick={() => saveSettings({ anchor: null })} className="text-xs text-slate-500 underline">
                    삭제
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 이력 */}
        {sortedRecords.length > 0 && (
          <section className="mt-4 text-sm">
            <h3 className="font-semibold">기록 이력</h3>
            <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {sortedRecords.map((r) => (
                <li key={r.id} className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {r.year}년 {r.month}월
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${r.status === "done" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                      {r.status === "done" ? "완료" : "해당없음"}
                    </span>
                    {r.doneDate && <span className="text-xs text-slate-500">{r.doneDate}</span>}
                    {r.by && <span className="text-xs text-slate-500">· {r.by}</span>}
                  </div>
                  {r.note && <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600">{r.note}</p>}
                  {r.files.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs">
                      {r.files.map((f) => (
                        <a key={f.path} href={`/api/file?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">
                          📎 {f.name}
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
