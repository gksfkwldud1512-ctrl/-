import type { AutoResult, CellStatus, SettingsMap, TaskDef, TaskRecord, TaskSettings } from "./types";

/** 오늘 날짜(연·월) — 서버에서 계산해 클라이언트로 넘겨 하이드레이션 불일치를 막는다. */
export type Today = { year: number; month: number };

export function isEnabled(task: TaskDef, settings: SettingsMap): boolean {
  return settings[task.id]?.enabled ?? task.defaultEnabled;
}

function ym(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/** 이 업무의 해당월 목록(해당 연도). multiyear는 기준(대상)월·완료 기록에서 산정한다. */
export function dueMonths(task: TaskDef, settings: TaskSettings | undefined, records: TaskRecord[], year: number): number[] {
  const c = task.cadence;
  switch (c.kind) {
    case "monthly":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    case "months":
      return (settings?.months?.length ? settings.months : c.months).filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
    case "multiyear": {
      // 기준(대상)월 하나 + 완료할 때마다 (완료일 + N년)의 같은 달이 다음 해당월이 된다.
      const dues = new Set<number>();
      if (settings?.anchor) dues.add(ym(settings.anchor.year, settings.anchor.month));
      for (const r of records) {
        if (r.taskId === task.id && r.status === "done") dues.add(ym(r.year + c.years, r.month));
      }
      const out: number[] = [];
      for (const v of dues) if (Math.floor(v / 12) === year) out.push((v % 12) + 1);
      return out.sort((a, b) => a - b);
    }
    default:
      return [];
  }
}

/** multiyear인데 기준월도 완료 기록도 없어 해당월을 알 수 없는 경우 */
export function needsAnchor(task: TaskDef, settings: TaskSettings | undefined, records: TaskRecord[]): boolean {
  return (
    task.cadence.kind === "multiyear" &&
    !settings?.anchor &&
    !records.some((r) => r.taskId === task.id && r.status === "done")
  );
}

export function cellStatus(args: {
  task: TaskDef;
  settings: SettingsMap;
  records: TaskRecord[];
  auto?: AutoResult;
  year: number;
  month: number;
  today: Today;
}): CellStatus {
  const { task, settings, records, auto, year, month, today } = args;
  if (!isEnabled(task, settings)) return "na";

  const own = records.find((r) => r.taskId === task.id && r.year === year && r.month === month);
  if (own?.status === "na") return "na";

  // 자동판정 업무: 하위 시스템 결과로 월 단위 판정(수동 완료 기록도 인정). 연동 오류 시 임의로 완료/미실시 처리하지 않는다.
  if (task.auto) {
    if (!auto || auto.error) return own?.status === "done" ? "done" : "none";
    const v = auto.cells[month];
    if (!v) return own?.status === "done" ? "done" : "none";
    if (v === "done" || own?.status === "done") return "done";
    return ym(year, month) < ym(today.year, today.month) ? "overdue" : "due";
  }

  if (task.cadence.kind === "event") return own?.status === "done" ? "done" : "none";
  if (task.cadence.kind === "auto") return "none";

  const due = dueMonths(task, settings[task.id], records, year);
  if (due.length === 0) return "none";
  if (!due.includes(month)) {
    // 해당월이 아니어도 그 달에 실시 기록을 남겼다면 완료로 보여 준다(예: 정기교육을 앞당겨 실시)
    return own?.status === "done" ? "done" : "none";
  }
  if (own?.status === "done") return "done";
  return ym(year, month) < ym(today.year, today.month) ? "overdue" : "due";
}
