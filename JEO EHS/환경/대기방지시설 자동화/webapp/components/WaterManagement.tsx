"use client";

import { useMemo, useState } from "react";
import type { KpiSummary, MonthlyPoint } from "@/lib/kpi/parseDetails";
import {
  CONSUMPTION_LABEL,
  DISCHARGE_LABEL,
  categoryPoints,
  classifyConsumption,
  classifyDischarge,
  unmatchedMeasureNames,
} from "@/lib/kpi/waterUsage";

// -------------------------------------------
// 상단: 시설배치도 (업로드 데이터와 무관한 정적 흐름도)
// 복잡한 커넥터 선 대신 "박스 + 화살표 칩" 방식으로 구성 — 각 사용처 박스 바로 아래에
// 자신이 어디로 배출되는지 칩으로 표시해서, 선이 겹치거나 어긋나는 문제 없이 흐름을 전달한다.
// -------------------------------------------

const DEST_STYLE: Record<string, string> = {
  하수처리장: "bg-blue-50 text-blue-700",
  우수: "bg-sky-50 text-sky-700",
  폐수: "bg-orange-50 text-orange-700",
};

function UsageBox({ icon, label, dest }: { icon: string; label: string; dest: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-col items-center gap-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-medium text-zinc-700">{label}</span>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${DEST_STYLE[dest] ?? "bg-zinc-100 text-zinc-600"}`}>
        → {dest}
      </span>
    </div>
  );
}

function FlowLane({
  sourceIcon,
  sourceLabel,
  items,
}: {
  sourceIcon: string;
  sourceLabel: string;
  items: { icon: string; label: string; dest: string }[];
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
      <div className="flex flex-col items-center gap-1 rounded-lg border border-zinc-300 bg-white px-5 py-3 shadow-sm">
        <span className="text-2xl">{sourceIcon}</span>
        <span className="text-sm font-semibold text-zinc-800">{sourceLabel}</span>
      </div>
      <span className="text-zinc-400">↓ 공급</span>
      <div className="flex flex-wrap justify-center gap-4">
        {items.map((it) => (
          <UsageBox key={it.label} icon={it.icon} label={it.label} dest={it.dest} />
        ))}
      </div>
    </div>
  );
}

function FacilityLayout() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-800">시설배치도</h2>
      <p className="text-xs text-zinc-500">용수 공급원부터 사용처, 배출처까지의 흐름입니다.</p>

      <FlowLane
        sourceIcon="🚰"
        sourceLabel="일반용수 (구경 100mm)"
        items={[
          { icon: "🚻", label: "화장실", dest: "하수처리장" },
          { icon: "🚿", label: "샤워장", dest: "하수처리장" },
          { icon: "🍽️", label: "식당", dest: "하수처리장" },
          { icon: "🔥", label: "보일러", dest: "우수" },
        ]}
      />

      <FlowLane
        sourceIcon="🏭"
        sourceLabel="공업용수"
        items={[
          { icon: "🌀", label: "쿨링타워", dest: "우수" },
          { icon: "🔧", label: "피스톤세척기", dest: "폐수" },
          { icon: "🛢️", label: "바렐세척기", dest: "폐수" },
          { icon: "📦", label: "박스세척기", dest: "폐수" },
        ]}
      />
    </div>
  );
}

// -------------------------------------------
// 하단: 월별 소비수/배출수 표
// -------------------------------------------

type Row = {
  key: string; // "calendarYear-monthNumber", 정렬/필터용
  ym: string; // "2026-08" 표시용
  general?: number;
  industrial?: number;
  sewage?: number;
  effluent?: number;
};

function buildRows(
  general: MonthlyPoint[],
  industrial: MonthlyPoint[],
  sewage: MonthlyPoint[],
  effluent: MonthlyPoint[]
): Row[] {
  const map = new Map<string, Row>();

  function put(points: MonthlyPoint[], field: "general" | "industrial" | "sewage" | "effluent") {
    for (const p of points) {
      const key = `${p.calendarYear}-${String(p.monthNumber).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { key, ym: key });
      map.get(key)![field] = p.value;
    }
  }

  put(general, "general");
  put(industrial, "industrial");
  put(sewage, "sewage");
  put(effluent, "effluent");

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function fmt(v: number | undefined): string {
  if (v === undefined) return "-";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function sum(rows: Row[], field: "general" | "industrial" | "sewage" | "effluent"): number {
  return rows.reduce((acc, r) => acc + (r[field] ?? 0), 0);
}

export function WaterManagement({ summary }: { summary: KpiSummary | null }) {
  const waterBreakdown = summary?.breakdown.water ?? {};
  const dischargeBreakdown = summary?.breakdown.waterDischarge ?? {};

  const generalPoints = useMemo(() => categoryPoints(waterBreakdown, classifyConsumption, "general"), [waterBreakdown]);
  const industrialPoints = useMemo(() => categoryPoints(waterBreakdown, classifyConsumption, "industrial"), [waterBreakdown]);
  const sewagePoints = useMemo(() => categoryPoints(dischargeBreakdown, classifyDischarge, "sewage"), [dischargeBreakdown]);
  const effluentPoints = useMemo(() => categoryPoints(dischargeBreakdown, classifyDischarge, "effluent"), [dischargeBreakdown]);

  const unmatchedConsumption = useMemo(
    () => unmatchedMeasureNames(waterBreakdown, classifyConsumption, "other"),
    [waterBreakdown]
  );
  const unmatchedDischarge = useMemo(
    () => unmatchedMeasureNames(dischargeBreakdown, classifyDischarge, "other"),
    [dischargeBreakdown]
  );

  const allRows = useMemo(
    () => buildRows(generalPoints, industrialPoints, sewagePoints, effluentPoints),
    [generalPoints, industrialPoints, sewagePoints, effluentPoints]
  );

  const minYM = allRows[0]?.ym ?? "";
  const maxYM = allRows[allRows.length - 1]?.ym ?? "";
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const effectiveStart = rangeStart || minYM;
  const effectiveEnd = rangeEnd || maxYM;
  const isFullRange = effectiveStart === minYM && effectiveEnd === maxYM;

  const rows = useMemo(
    () => allRows.filter((r) => (!effectiveStart || r.key >= effectiveStart) && (!effectiveEnd || r.key <= effectiveEnd)),
    [allRows, effectiveStart, effectiveEnd]
  );

  return (
    <div className="flex flex-col gap-6">
      <FacilityLayout />

      <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-800">월별 소비수 · 배출수</h2>
          {allRows.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600" htmlFor="waterRangeStart">
                  시작 연월
                </label>
                <input
                  id="waterRangeStart"
                  type="month"
                  value={effectiveStart}
                  min={minYM}
                  max={maxYM}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              <span className="pb-1.5 text-zinc-400">~</span>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-600" htmlFor="waterRangeEnd">
                  종료 연월
                </label>
                <input
                  id="waterRangeEnd"
                  type="month"
                  value={effectiveEnd}
                  min={minYM}
                  max={maxYM}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              {!isFullRange && (
                <button
                  type="button"
                  onClick={() => {
                    setRangeStart("");
                    setRangeEnd("");
                  }}
                  className="mb-0.5 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200"
                >
                  전체 기간 보기
                </button>
              )}
            </div>
          )}
        </div>

        {allRows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-400">
            아직 업로드된 데이터가 없습니다. &quot;안전환경 KPI&quot;에서 DETAILS 파일을 업로드해 주세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th rowSpan={2} className="border-b border-zinc-200 px-3 py-2 text-left font-medium align-bottom">
                    월
                  </th>
                  <th colSpan={3} className="border-b border-zinc-200 px-3 py-1.5 text-center font-medium">
                    소비용수
                  </th>
                  <th colSpan={3} className="border-b border-zinc-200 px-3 py-1.5 text-center font-medium">
                    배출수
                  </th>
                </tr>
                <tr>
                  <th className="border-b border-zinc-200 px-3 py-2 text-right font-medium">{CONSUMPTION_LABEL.general}</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-right font-medium">{CONSUMPTION_LABEL.industrial}</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-right font-medium">소비수 합계</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-right font-medium">{DISCHARGE_LABEL.sewage}</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-right font-medium">{DISCHARGE_LABEL.effluent}</th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-right font-medium">배출수 합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-3 py-2 font-medium text-zinc-700 whitespace-nowrap">{r.ym}</td>
                    <td className="px-3 py-2 text-right text-zinc-600">{fmt(r.general)}</td>
                    <td className="px-3 py-2 text-right text-zinc-600">{fmt(r.industrial)}</td>
                    <td className="px-3 py-2 text-right font-medium text-zinc-800">
                      {fmt((r.general ?? 0) + (r.industrial ?? 0) || undefined)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600">{fmt(r.sewage)}</td>
                    <td className="px-3 py-2 text-right text-zinc-600">{fmt(r.effluent)}</td>
                    <td className="px-3 py-2 text-right font-medium text-zinc-800">
                      {fmt((r.sewage ?? 0) + (r.effluent ?? 0) || undefined)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold text-zinc-800">
                  <td className="px-3 py-2">합계 (㎥)</td>
                  <td className="px-3 py-2 text-right">{fmt(sum(rows, "general"))}</td>
                  <td className="px-3 py-2 text-right">{fmt(sum(rows, "industrial"))}</td>
                  <td className="px-3 py-2 text-right">{fmt(sum(rows, "general") + sum(rows, "industrial"))}</td>
                  <td className="px-3 py-2 text-right">{fmt(sum(rows, "sewage"))}</td>
                  <td className="px-3 py-2 text-right">{fmt(sum(rows, "effluent"))}</td>
                  <td className="px-3 py-2 text-right">{fmt(sum(rows, "sewage") + sum(rows, "effluent"))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {(unmatchedConsumption.length > 0 || unmatchedDischarge.length > 0) && (
          <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <p className="font-medium">분류되지 않은 항목이 있습니다 — 아래 원문 라벨을 알려주시면 정확히 매칭하겠습니다.</p>
            {unmatchedConsumption.length > 0 && <p className="mt-1">소비용수: {unmatchedConsumption.join(", ")}</p>}
            {unmatchedDischarge.length > 0 && <p className="mt-1">배출수: {unmatchedDischarge.join(", ")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
