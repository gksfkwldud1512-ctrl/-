"use client";

import { POWER_FACILITIES } from "@/lib/facilities";
import type { MeterReadings } from "@/lib/calc";

export default function MeterInputs({
  readings,
  onChange,
  workdayCount,
}: {
  readings: MeterReadings;
  onChange: (readings: MeterReadings) => void;
  workdayCount: number;
}) {
  function update(key: string, field: "first" | "last", value: number) {
    const cur = readings[key] ?? { first: 0, last: 0 };
    onChange({ ...readings, [key]: { ...cur, [field]: value } });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-xs text-neutral-500 px-1">
        <span>설비명</span>
        <span className="text-right w-24">첫날 전력계</span>
        <span className="text-right w-24">마지막날 전력계</span>
        <span className="text-right w-20">일일 증가량</span>
      </div>
      {POWER_FACILITIES.map((f) => {
        const r = readings[f.key] ?? { first: 0, last: 0 };
        const increment = workdayCount > 0 ? (r.last - r.first) / workdayCount : 0;
        const invalid = r.last !== 0 && r.first !== 0 && r.last < r.first;
        return (
          <div
            key={f.key}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-1 py-1 rounded-md odd:bg-neutral-50 dark:odd:bg-neutral-900"
          >
            <span className="text-sm truncate" title={f.outletName}>
              {f.outletName}
            </span>
            <input
              type="number"
              className="w-24 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1 text-sm text-right"
              value={r.first || ""}
              onChange={(e) => update(f.key, "first", Number(e.target.value))}
              placeholder="0"
            />
            <input
              type="number"
              className={`w-24 rounded border bg-transparent px-2 py-1 text-sm text-right ${
                invalid ? "border-red-500" : "border-neutral-300 dark:border-neutral-700"
              }`}
              value={r.last || ""}
              onChange={(e) => update(f.key, "last", Number(e.target.value))}
              placeholder="0"
            />
            <span className="w-20 text-right text-sm text-neutral-500">
              {workdayCount > 0 ? increment.toFixed(2) : "-"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
