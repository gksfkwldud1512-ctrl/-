"use client";

import { daysInMonth } from "@/lib/facilities";
import type { BoilerUnit, Calendar } from "@/lib/calc";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const STATE_STYLE: Record<BoilerUnit, string> = {
  0: "bg-neutral-100 text-neutral-400 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-500 dark:border-neutral-700",
  1: "bg-blue-600 text-white border-blue-600",
  2: "bg-amber-500 text-white border-amber-500",
};

const STATE_LABEL: Record<BoilerUnit, string> = {
  0: "휴무",
  1: "1호기",
  2: "2호기",
};

export default function CalendarGrid({
  year,
  month,
  calendar,
  onChange,
}: {
  year: number;
  month: number;
  calendar: Calendar;
  onChange: (calendar: Calendar) => void;
}) {
  const n = daysInMonth(year, month);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: n }, (_, i) => i + 1),
  ];

  function cycle(day: number) {
    const cur = calendar[day] ?? 0;
    const next: BoilerUnit = cur === 0 ? 1 : cur === 1 ? 2 : 0;
    onChange({ ...calendar, [day]: next });
  }

  const workdayCount = Object.values(calendar).filter((v) => v !== 0).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-neutral-500">
          날짜를 클릭하면 휴무 → 1호기 → 2호기 순서로 바뀝니다. (1·2호기 모두 근무일로 처리)
        </p>
        <p className="text-sm font-medium">근무일수: {workdayCount}일</p>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`blank-${idx}`} />;
          const state = calendar[day] ?? 0;
          return (
            <button
              key={day}
              type="button"
              onClick={() => cycle(day)}
              className={`aspect-square rounded-md border text-xs flex flex-col items-center justify-center gap-0.5 transition-colors ${STATE_STYLE[state]}`}
            >
              <span className="font-semibold">{day}</span>
              <span>{STATE_LABEL[state]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
