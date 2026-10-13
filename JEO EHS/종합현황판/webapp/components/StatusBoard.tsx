"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORY_ICON, CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/types";
import type { AutoResult, Category, CellStatus, SettingsMap, TaskDef, TaskRecord } from "@/lib/types";
import { cellStatus, dueMonths, isEnabled, needsAnchor, type Today } from "@/lib/taskStatus";
import { TaskModal } from "./TaskModal";

type Props = {
  year: number;
  today: Today & { day: number };
  tasks: TaskDef[];
  settings: SettingsMap;
  records: TaskRecord[];
  autoByTask: Record<string, AutoResult>;
};

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const STATUS_LABEL: Record<CellStatus, string> = {
  none: "",
  na: "해당없음",
  done: "완료",
  due: "해당",
  overdue: "미실시",
  anchor: "기준월",
};

const STATUS_CLASS: Record<CellStatus, string> = {
  none: "bg-white text-transparent",
  na: "bg-slate-100 text-slate-400",
  done: "bg-emerald-500 text-white",
  due: "bg-amber-300 text-amber-950",
  overdue: "status-overdue text-white",
  anchor: "bg-slate-200 text-slate-600",
};

export function StatusBoard({ year, today, tasks, settings, records, autoByTask }: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<Category | "all">("all");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [open, setOpen] = useState<{ taskId: string; month: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"board" | "removed">("board");
  const [restoring, setRestoring] = useState<string | null>(null);

  // 모든 칸의 상태를 한 번에 계산
  const matrix = useMemo(() => {
    const m = new Map<string, CellStatus[]>();
    for (const t of tasks) {
      m.set(
        t.id,
        MONTHS.map((month) =>
          cellStatus({ task: t, settings, records, auto: autoByTask[t.id], year, month, today })
        )
      );
    }
    return m;
  }, [tasks, settings, records, autoByTask, year, today]);

  const enabledTasks = tasks.filter((t) => isEnabled(t, settings));
  const thisMonthDue = enabledTasks.filter((t) => ["due", "overdue"].includes(matrix.get(t.id)![today.month - 1]));
  const overdueCells = enabledTasks.reduce((n, t) => n + matrix.get(t.id)!.filter((s) => s === "overdue").length, 0);
  const overdueTasks = enabledTasks.filter((t) => matrix.get(t.id)!.includes("overdue"));
  const eduTasks = enabledTasks.filter((t) => t.auto === "education");
  const eduProblems = eduTasks.filter((t) => matrix.get(t.id)!.some((s) => s === "overdue" || s === "due"));
  const syncErrors = Object.entries(autoByTask).filter(([, a]) => a.error);

  // 삭제(=해당없음으로 끈) 업무는 현황판에서 완전히 숨기고 "삭제된 업무" 탭에서만 보여 준다.
  const removedTasks = tasks.filter((t) => !isEnabled(t, settings));
  const visibleTasks = tasks.filter((t) => {
    if (!isEnabled(t, settings)) return false;
    if (category !== "all" && t.category !== category) return false;
    if (onlyProblems) return matrix.get(t.id)!.some((s) => s === "overdue" || s === "due");
    return true;
  });

  async function restore(taskId: string) {
    setRestoring(taskId);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, patch: { enabled: true } }),
      });
      router.refresh();
    } finally {
      setRestoring(null);
    }
  }

  const openTask = open ? tasks.find((t) => t.id === open.taskId) : null;

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1500px] flex-1 flex-col gap-4 px-4 py-5">
      {/* 제목 + 연도 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">📊 안전환경보건 종합업무현황판</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            법정 업무의 월별 이행 현황 — 칸을 누르면 근거·과태료를 확인하고 완료 내용을 기록할 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/?year=${year - 1}`)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            ◀
          </button>
          <span className="min-w-[4.5rem] text-center text-lg font-semibold">{year}년</span>
          <button
            type="button"
            onClick={() => router.push(`/?year=${year + 1}`)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            ▶
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-slate-300">
        {([
          ["board", "📊 현황판"],
          ["removed", `🗑 삭제된 업무 (${removedTasks.length})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            className={`-mb-px rounded-t-md border px-4 py-2 text-sm font-medium ${
              view === k ? "border-slate-300 border-b-white bg-white text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "removed" ? (
        <RemovedList tasks={removedTasks} restoring={restoring} onRestore={restore} />
      ) : (
      <>
      {/* 요약 배너(알림 역할) */}
      <section className="grid gap-3 md:grid-cols-3">
        <div className={`rounded-lg border p-3 ${overdueCells > 0 ? "border-red-300 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="text-xs font-medium text-slate-500">미실시 (기한 지난 미완료)</div>
          <div className={`mt-1 text-2xl font-bold ${overdueCells > 0 ? "text-red-600" : "text-emerald-600"}`}>{overdueCells}건</div>
          <div className="mt-1 truncate text-xs text-slate-600" title={overdueTasks.map((t) => t.title).join(", ")}>
            {overdueTasks.length ? overdueTasks.map((t) => t.title).join(" · ") : "미실시 업무가 없습니다"}
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-medium text-slate-500">{today.month}월 해야 할 업무</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{thisMonthDue.length}건</div>
          <div className="mt-1 truncate text-xs text-slate-600" title={thisMonthDue.map((t) => t.title).join(", ")}>
            {thisMonthDue.length ? thisMonthDue.map((t) => t.title).join(" · ") : "이번 달 남은 업무가 없습니다"}
          </div>
        </div>
        <div className={`rounded-lg border p-3 ${eduProblems.length ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"}`}>
          <div className="text-xs font-medium text-slate-500">법정교육 알림</div>
          <div className="mt-1 text-2xl font-bold text-orange-700">{eduProblems.length}건</div>
          <div className="mt-1 truncate text-xs text-slate-600" title={eduProblems.map((t) => t.title).join(", ")}>
            {eduTasks.length === 0
              ? "등록된 법정교육이 없습니다 (중처법 이행관리 앱 > 법정교육)"
              : eduProblems.length
                ? eduProblems.map((t) => t.title.replace("법정교육: ", "")).join(" · ")
                : "올해 받아야 할 교육이 없습니다"}
          </div>
        </div>
      </section>

      {syncErrors.length > 0 && (
        <div className="rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-600">
          ⚠ 연동 오류: {syncErrors.map(([, a]) => a.error).join(" / ")} — 오류 항목은 회색으로 두고 임의로 완료 처리하지 않습니다.
        </div>
      )}

      {/* 필터 + 범례 */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...CATEGORY_ORDER] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1 text-sm ${
              category === c ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white hover:bg-slate-100"
            }`}
          >
            {c === "all" ? "전체" : `${CATEGORY_ICON[c]} ${CATEGORY_LABEL[c]}`}
          </button>
        ))}
        <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-sm">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
          해당·미실시 업무만
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {(["done", "due", "overdue", "na"] as const).map((s) => (
            <span key={s} className={`rounded px-2 py-0.5 font-medium ${STATUS_CLASS[s]} ${s === "overdue" ? "" : ""}`}>
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      {/* 월별 표 */}
      <div className="max-w-full overflow-x-auto rounded-lg border border-slate-300 bg-white">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-800 text-white">
            <tr>
              <th className="sticky left-0 z-20 min-w-[300px] bg-slate-800 px-3 py-2 text-left font-medium">진행해야 할 업무</th>
              {MONTHS.map((m) => (
                <th
                  key={m}
                  className={`w-[6.2%] px-1 py-2 text-center font-medium ${year === today.year && m === today.month ? "bg-indigo-600" : ""}`}
                >
                  {m}월
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.filter((c) => category === "all" || category === c).map((c) => {
              const rows = visibleTasks.filter((t) => t.category === c);
              if (rows.length === 0) return null;
              const isCollapsed = collapsed[c];
              const problemCount = rows.filter((t) => isEnabled(t, settings) && matrix.get(t.id)!.includes("overdue")).length;
              return (
                <GroupRows
                  key={c}
                  category={c}
                  rows={rows}
                  isCollapsed={!!isCollapsed}
                  problemCount={problemCount}
                  onToggle={() => setCollapsed((s) => ({ ...s, [c]: !s[c] }))}
                  matrix={matrix}
                  settings={settings}
                  records={records}
                  autoByTask={autoByTask}
                  year={year}
                  today={today}
                  onOpen={(taskId, month) => setOpen({ taskId, month })}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        ※ 업무 목록·주기·과태료는 법령 원문 확인 전 초안입니다. 업무를 눌러 &apos;법령 확인함&apos;을 표시하고, 사업장에 해당 없는 업무는
        &apos;해당없음&apos;으로 끄세요. 해당월·대상월은 업무별로 보정할 수 있습니다.
      </p>

      </>
      )}

      {openTask && open && (
        <TaskModal
          key={`${open.taskId}-${open.month}`}
          task={openTask}
          month={open.month}
          year={year}
          today={today}
          settings={settings[openTask.id]}
          records={records.filter((r) => r.taskId === openTask.id)}
          auto={autoByTask[openTask.id]}
          status={matrix.get(openTask.id)![open.month - 1]}
          onClose={() => setOpen(null)}
        />
      )}
    </main>
  );
}

function GroupRows(props: {
  category: Category;
  rows: TaskDef[];
  isCollapsed: boolean;
  problemCount: number;
  onToggle: () => void;
  matrix: Map<string, CellStatus[]>;
  settings: SettingsMap;
  records: TaskRecord[];
  autoByTask: Record<string, AutoResult>;
  year: number;
  today: Today & { day: number };
  onOpen: (taskId: string, month: number) => void;
}) {
  const { category, rows, isCollapsed, problemCount, onToggle, matrix, settings, records, autoByTask, year, today, onOpen } = props;
  return (
    <>
      <tr className="cursor-pointer bg-slate-100" onClick={onToggle}>
        <td colSpan={13} className="sticky left-0 border-y border-slate-300 px-3 py-1.5 font-semibold">
          {isCollapsed ? "▸" : "▾"} {CATEGORY_ICON[category]} {CATEGORY_LABEL[category]}
          <span className="ml-2 text-xs font-normal text-slate-500">{rows.length}개 업무</span>
          {problemCount > 0 && (
            <span className="status-overdue ml-2 rounded px-2 py-0.5 text-xs font-medium text-white">미실시 {problemCount}</span>
          )}
        </td>
      </tr>
      {!isCollapsed &&
        rows.map((t) => {
          const cells = matrix.get(t.id)!;
          const auto = autoByTask[t.id];
          const anchorMissing = needsAnchor(t, settings[t.id], records.filter((r) => r.taskId === t.id));
          const due = dueMonths(t, settings[t.id], records, year);
          return (
            <tr key={t.id} className="border-b border-slate-200">
              <td className="sticky left-0 z-[5] bg-white px-3 py-1.5 align-middle">
                <button type="button" onClick={() => onOpen(t.id, due[0] ?? today.month)} className="block w-full text-left">
                  <span className="font-medium hover:underline">{t.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">{t.role}</span>
                    <span>{t.cadence.label}</span>
                    {t.auto && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700">자동판정</span>}
                    {anchorMissing && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">대상월 입력 필요</span>}
                    {auto?.error && <span className="rounded bg-slate-200 px-1.5 py-0.5">연동 오류</span>}
                    {!settings[t.id]?.verified && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700">법령 확인필요</span>}
                  </span>
                </button>
              </td>
              {cells.map((s, i) => {
                const isNow = year === today.year && i + 1 === today.month;
                const label = STATUS_LABEL[s];
                return (
                  <td key={i} className={`px-0.5 py-1 text-center ${isNow ? "bg-indigo-50" : ""}`}>
                    <button
                      type="button"
                      onClick={() => onOpen(t.id, i + 1)}
                      title={`${t.title} · ${i + 1}월 ${STATUS_LABEL[s] || "해당월 아님"}`}
                      className={`h-8 w-full rounded text-xs font-semibold ${STATUS_CLASS[s]} ${
                        s === "none" ? "border border-dashed border-slate-200 hover:bg-slate-50" : "hover:brightness-95"
                      }`}
                    >
                      {label}
                    </button>
                  </td>
                );
              })}
            </tr>
          );
        })}
    </>
  );
}

function RemovedList(props: { tasks: TaskDef[]; restoring: string | null; onRestore: (id: string) => void }) {
  const { tasks, restoring, onRestore } = props;
  if (tasks.length === 0) {
    return <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">삭제된 업무가 없습니다.</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        현황판에서 삭제한 업무입니다. 알림·미실시 집계에서 빠져 있으며, &apos;복원&apos;을 누르면 현황판에 다시 나타납니다.
      </p>
      {CATEGORY_ORDER.map((c) => {
        const rows = tasks.filter((t) => t.category === c);
        if (rows.length === 0) return null;
        return (
          <section key={c} className="overflow-hidden rounded-lg border border-slate-300 bg-white">
            <h2 className="bg-slate-100 px-3 py-1.5 text-sm font-semibold">
              {CATEGORY_ICON[c]} {CATEGORY_LABEL[c]} <span className="text-xs font-normal text-slate-500">{rows.length}개</span>
            </h2>
            <ul className="divide-y divide-slate-100">
              {rows.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium">{t.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{t.role}</span>
                      <span>{t.cadence.label}</span>
                      <span className="truncate">{t.basis}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={restoring === t.id}
                    onClick={() => onRestore(t.id)}
                    className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
                  >
                    {restoring === t.id ? "복원 중…" : "↩ 복원"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
