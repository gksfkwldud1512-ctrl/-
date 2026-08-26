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
// 파이프라인 형태 — 하나의 SVG 좌표계 안에 배관(선)과 박스(HTML, % 좌표로 겹쳐 배치)를
// 함께 두어, 화면 크기가 바뀌어도(aspect-ratio + %) 배관과 박스가 항상 정확히 맞물린다.
// (컨테이너 실측 폭에 의존하는 별도 계산이 없어, 이전에 겪은 정렬 어긋남 문제가 구조적으로 없다.)
// -------------------------------------------

const VB_W = 1020;
const VB_H = 340;
const COLS = [150, 390, 630, 870];
const SOURCE_Y = 32;
const HEADER_Y = 92;
const ICON_Y = 168;
const ICON_HALF_H = 42;
const COLLECTOR_Y = 252;
const DISCHARGE_Y = 306;
const DISCHARGE_HALF_H = 32;
const PIPE_W = 15;

const PIPE_COLOR: Record<string, string> = {
  supplyGeneral: "#0284c7", // sky-600
  supplyIndustrial: "#7c3aed", // violet-600
  하수처리장: "#2563eb", // blue-600
  우수: "#0ea5e9", // sky-500
  폐수: "#ea580c", // orange-600
};

const DEST_BADGE: Record<string, string> = {
  하수처리장: "bg-blue-50 text-blue-700 border-blue-200",
  우수: "bg-sky-50 text-sky-700 border-sky-200",
  폐수: "bg-orange-50 text-orange-700 border-orange-200",
};

function pct(v: number, total: number): string {
  return `${(v / total) * 100}%`;
}

function ArrowDown({ x, y, color }: { x: number; y: number; color: string }) {
  const s = 9;
  return <polygon points={`${x - s},${y - s} ${x + s},${y - s} ${x},${y + s}`} fill={color} />;
}

type Group = { columns: number[]; dest: "하수처리장" | "우수" | "폐수" };

function PipelineLane({
  sourceIcon,
  sourceLabel,
  supplyColor,
  items,
  groups,
}: {
  sourceIcon: string;
  sourceLabel: string;
  supplyColor: string;
  items: { icon: string; label: string }[];
  groups: Group[];
}) {
  return (
    <div className="relative w-full" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
        {/* 공급원 -> 헤더 배관 */}
        <line x1={VB_W / 2} y1={SOURCE_Y + 24} x2={VB_W / 2} y2={HEADER_Y} stroke={supplyColor} strokeWidth={PIPE_W} strokeLinecap="round" />
        <line x1={COLS[0]} y1={HEADER_Y} x2={COLS[COLS.length - 1]} y2={HEADER_Y} stroke={supplyColor} strokeWidth={PIPE_W} strokeLinecap="round" />
        {/* 헤더 -> 각 사용처 분기 배관 */}
        {COLS.map((x, i) => (
          <line key={i} x1={x} y1={HEADER_Y} x2={x} y2={ICON_Y - ICON_HALF_H - 6} stroke={supplyColor} strokeWidth={PIPE_W} strokeLinecap="round" />
        ))}
        {COLS.map((x, i) => (
          <ArrowDown key={`ah-${i}`} x={x} y={ICON_Y - ICON_HALF_H - 4} color={supplyColor} />
        ))}

        {/* 사용처 -> 배출처 배관 (그룹은 collector로 합류) */}
        {groups.map((g, gi) => {
          const xs = g.columns.map((i) => COLS[i]);
          const color = PIPE_COLOR[g.dest];
          if (xs.length === 1) {
            return (
              <g key={gi}>
                <line x1={xs[0]} y1={ICON_Y + ICON_HALF_H} x2={xs[0]} y2={DISCHARGE_Y - DISCHARGE_HALF_H - 6} stroke={color} strokeWidth={PIPE_W} strokeLinecap="round" />
                <ArrowDown x={xs[0]} y={DISCHARGE_Y - DISCHARGE_HALF_H - 4} color={color} />
              </g>
            );
          }
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const midX = (minX + maxX) / 2;
          return (
            <g key={gi}>
              {xs.map((x) => (
                <line key={x} x1={x} y1={ICON_Y + ICON_HALF_H} x2={x} y2={COLLECTOR_Y} stroke={color} strokeWidth={PIPE_W} strokeLinecap="round" />
              ))}
              <line x1={minX} y1={COLLECTOR_Y} x2={maxX} y2={COLLECTOR_Y} stroke={color} strokeWidth={PIPE_W} strokeLinecap="round" />
              <line x1={midX} y1={COLLECTOR_Y} x2={midX} y2={DISCHARGE_Y - DISCHARGE_HALF_H - 6} stroke={color} strokeWidth={PIPE_W} strokeLinecap="round" />
              <ArrowDown x={midX} y={DISCHARGE_Y - DISCHARGE_HALF_H - 4} color={color} />
            </g>
          );
        })}
      </svg>

      {/* 공급원 박스 */}
      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-4 py-2 shadow-sm"
        style={{ left: pct(VB_W / 2, VB_W), top: pct(SOURCE_Y, VB_H) }}
      >
        <span className="text-xl leading-none">{sourceIcon}</span>
        <span className="text-xs font-semibold text-zinc-800">{sourceLabel}</span>
      </div>

      {/* 사용처 박스 4개 */}
      {items.map((it, i) => (
        <div
          key={it.label}
          className="absolute flex w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-center shadow-sm"
          style={{ left: pct(COLS[i], VB_W), top: pct(ICON_Y, VB_H) }}
        >
          <span className="text-xl leading-none">{it.icon}</span>
          <span className="text-[11px] font-medium leading-tight text-zinc-700">{it.label}</span>
        </div>
      ))}

      {/* 배출처 박스 (그룹당 1개) */}
      {groups.map((g, gi) => {
        const xs = g.columns.map((i) => COLS[i]);
        const x = xs.length === 1 ? xs[0] : (Math.min(...xs) + Math.max(...xs)) / 2;
        return (
          <div
            key={gi}
            className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${DEST_BADGE[g.dest]}`}
            style={{ left: pct(x, VB_W), top: pct(DISCHARGE_Y, VB_H) }}
          >
            {g.dest}
          </div>
        );
      })}
    </div>
  );
}

function FacilityLayout() {
  return (
    <div className="flex flex-col gap-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-800">시설배치도</h2>
        <p className="text-xs text-zinc-500">용수 공급원부터 사용처, 배출처까지의 배관 흐름입니다.</p>
      </div>

      <PipelineLane
        sourceIcon="🚰"
        sourceLabel="일반용수 (구경 100mm)"
        supplyColor={PIPE_COLOR.supplyGeneral}
        items={[
          { icon: "🚻", label: "화장실" },
          { icon: "🚿", label: "샤워장" },
          { icon: "🍽️", label: "식당" },
          { icon: "🔥", label: "보일러" },
        ]}
        groups={[
          { columns: [0, 1, 2], dest: "하수처리장" },
          { columns: [3], dest: "우수" },
        ]}
      />

      <PipelineLane
        sourceIcon="🏭"
        sourceLabel="공업용수"
        supplyColor={PIPE_COLOR.supplyIndustrial}
        items={[
          { icon: "🌀", label: "쿨링타워" },
          { icon: "🔧", label: "피스톤세척기" },
          { icon: "🛢️", label: "바렐세척기" },
          { icon: "📦", label: "박스세척기" },
        ]}
        groups={[
          { columns: [0], dest: "우수" },
          { columns: [1, 2, 3], dest: "폐수" },
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
