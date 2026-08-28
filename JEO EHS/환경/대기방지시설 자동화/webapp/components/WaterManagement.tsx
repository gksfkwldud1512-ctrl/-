"use client";

import { useMemo, useState } from "react";
import type { KpiSummary, MonthlyPoint } from "@/lib/kpi/parseDetails";
import type { FacilitySpec, FacilitySpecs, FixtureEntry } from "@/lib/kpi/facilitySpecs";
import { FIXTURE_PRESETS, FIXTURE_TYPES, type FixtureType } from "@/lib/kpi/fixturePresets";
import {
  CONSUMPTION_LABEL,
  DISCHARGE_LABEL,
  categoryPoints,
  classifyConsumption,
  classifyDischarge,
  unmatchedMeasureNames,
} from "@/lib/kpi/waterUsage";
import {
  BOILER_FLOW_RATE_LPH,
  BOILER_TANK_MONTHLY_M3,
  COOLING_TOWER_CAPACITY_KCAL_HR,
  COOLING_TOWER_FLOW_LPM,
  LATENT_HEAT_KCAL_PER_KG,
  boilerOwnMonthlyM3,
  boilerTotalMonthlyM3,
  coolingTowerEvaporationMonthly,
  evaporationRatePercentOfCirculation,
  expectedFlowLpmFromCapacity,
} from "@/lib/kpi/waterCalc";

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
const PIPE_W = 7; // 얇게(작게) 구성 — 두꺼우면 점선 방향이 뭉개져 안 보임

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
  const s = 12;
  return (
    <polygon
      points={`${x - s},${y - s} ${x + s},${y - s} ${x},${y + s}`}
      fill={color}
      stroke="white"
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
  );
}

type Group = { columns: number[]; dest: "하수처리장" | "우수" | "폐수"; annotation?: string[] };
type Item = { icon: string; label: string; sub?: string[] };

function PipelineLane({
  sourceIcon,
  sourceLabel,
  sourceSub,
  supplyColor,
  items,
  groups,
  onSelectItem,
  hasSpec,
}: {
  sourceIcon: string;
  sourceLabel: string;
  sourceSub?: string;
  supplyColor: string;
  items: Item[];
  groups: Group[];
  onSelectItem: (label: string) => void;
  hasSpec: (label: string) => boolean;
}) {
  return (
    <div className="relative w-full" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
        {/* 공급원 -> 헤더 배관 */}
        <line className="pipe-flow" x1={VB_W / 2} y1={SOURCE_Y + 24} x2={VB_W / 2} y2={HEADER_Y} stroke={supplyColor} strokeWidth={PIPE_W} strokeLinecap="round" />
        <line className="pipe-flow" x1={COLS[0]} y1={HEADER_Y} x2={COLS[COLS.length - 1]} y2={HEADER_Y} stroke={supplyColor} strokeWidth={PIPE_W} strokeLinecap="round" />
        {/* 헤더 -> 각 사용처 분기 배관 */}
        {COLS.map((x, i) => (
          <line className="pipe-flow" key={i} x1={x} y1={HEADER_Y} x2={x} y2={ICON_Y - ICON_HALF_H - 6} stroke={supplyColor} strokeWidth={PIPE_W} strokeLinecap="round" />
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
                <line className="pipe-flow" x1={xs[0]} y1={ICON_Y + ICON_HALF_H} x2={xs[0]} y2={DISCHARGE_Y - DISCHARGE_HALF_H - 6} stroke={color} strokeWidth={PIPE_W} strokeLinecap="round" />
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
                <line className="pipe-flow" key={x} x1={x} y1={ICON_Y + ICON_HALF_H} x2={x} y2={COLLECTOR_Y} stroke={color} strokeWidth={PIPE_W} strokeLinecap="round" />
              ))}
              <line className="pipe-flow" x1={minX} y1={COLLECTOR_Y} x2={maxX} y2={COLLECTOR_Y} stroke={color} strokeWidth={PIPE_W} strokeLinecap="round" />
              <line className="pipe-flow" x1={midX} y1={COLLECTOR_Y} x2={midX} y2={DISCHARGE_Y - DISCHARGE_HALF_H - 6} stroke={color} strokeWidth={PIPE_W} strokeLinecap="round" />
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
        <span className="text-sm font-semibold text-zinc-800">{sourceLabel}</span>
        {sourceSub && <span className="text-xs font-medium text-zinc-500">{sourceSub}</span>}
      </div>

      {/* 사용처 박스 4개 — 클릭하면 세부시설항목 입력창이 열린다 */}
      {items.map((it, i) => (
        <button
          key={it.label}
          type="button"
          onClick={() => onSelectItem(it.label)}
          className="group absolute flex w-[130px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-center shadow-sm transition hover:border-zinc-400 hover:shadow-md"
          style={{ left: pct(COLS[i], VB_W), top: pct(ICON_Y, VB_H) }}
        >
          {hasSpec(it.label) && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white">
              ✓
            </span>
          )}
          <span className="text-xl leading-none">{it.icon}</span>
          <span className="text-xs font-medium leading-tight text-zinc-700">{it.label}</span>
          {it.sub?.map((line) => (
            <span key={line} className="text-[11px] leading-tight text-zinc-500">
              {line}
            </span>
          ))}
          <span className="text-[10px] leading-tight text-zinc-400 opacity-0 transition group-hover:opacity-100">세부시설항목 ▸</span>
        </button>
      ))}

      {/* 배출처 박스 (그룹당 1개) */}
      {groups.map((g, gi) => {
        const xs = g.columns.map((i) => COLS[i]);
        const x = xs.length === 1 ? xs[0] : (Math.min(...xs) + Math.max(...xs)) / 2;
        return (
          <div
            key={gi}
            className={`absolute max-w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-lg border px-3 py-2 text-center shadow-sm ${DEST_BADGE[g.dest]}`}
            style={{ left: pct(x, VB_W), top: pct(DISCHARGE_Y, VB_H) }}
          >
            <div className="text-sm font-bold">{g.dest}</div>
            {g.annotation?.map((line) => (
              <div key={line} className="mt-0.5 text-sm font-semibold leading-snug opacity-90">
                {line}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function fmtM3(v: number | undefined | null, decimals = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "-";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

function FacilityLayout({
  availableYMs,
  selectedYM,
  onChangeYM,
  generalTotal,
  industrialTotal,
  sewageActual,
  effluentActual,
  onSelectItem,
  hasSpec,
  specs,
}: {
  availableYMs: string[];
  selectedYM: string;
  onChangeYM: (ym: string) => void;
  generalTotal?: number;
  industrialTotal?: number;
  sewageActual?: number;
  effluentActual?: number;
  onSelectItem: (label: string) => void;
  hasSpec: (label: string) => boolean;
  specs: FacilitySpecs;
}) {
  // 일반용수 계열: 온수탱크 보충(월 360㎥ 고정) + 보일러 자체 사용량(500L/hr×가동시간, 별도 계산)을
  // 뺀 나머지가 화장실·샤워장·식당을 거쳐 하수처리장으로 간다고 계산.
  const boilerOwn = selectedYM ? boilerOwnMonthlyM3(selectedYM) : undefined;
  const boilerTotal = selectedYM ? boilerTotalMonthlyM3(selectedYM) : undefined;
  const sewageComputed = generalTotal !== undefined && boilerTotal !== undefined ? Math.max(generalTotal - boilerTotal, 0) : undefined;

  // 화장실·샤워장·식당에 등록된 기구(소변기/대변기/세면대 등) 목록으로부터 이론 월 사용량을
  // 합산 — 사용횟수를 입력한 기구가 하나도 없으면 undefined(비교 대상 없음)로 둔다.
  const fixtureFacilityNames = ["화장실", "샤워장", "식당"];
  const fixtureEntries = fixtureFacilityNames.flatMap((name) => specs[name]?.fixtures ?? []);
  const hasAnyFixtureFrequency = fixtureEntries.some((f) => f.usesPerDayPerUnit);
  const sewageTheoreticalFromFixtures = hasAnyFixtureFrequency
    ? fixtureEntries.reduce((sum, f) => sum + fixtureMonthlyM3(f), 0)
    : undefined;

  // 공업용수 계열: 쿨링타워 증발량을 두 가지 방식으로 교차 계산한다.
  // ① 실사용 기준: 공업용수 총사용량 - 실측 폐수 배출량
  // ② 스펙 기준: 냉각용량 ÷ 증발잠열로 추정한 이론값(24시간 연속가동 가정)
  const evapByBalance =
    industrialTotal !== undefined && effluentActual !== undefined ? Math.max(industrialTotal - effluentActual, 0) : undefined;
  const evapBySpec = selectedYM ? coolingTowerEvaporationMonthly(selectedYM) : undefined;
  const evapRatePercent = evaporationRatePercentOfCirculation();
  // 폐수 추정치 = 공업용수 총사용량 - 스펙 기준 이론 증발량 (실측 폐수량과 교차 비교용).
  const effluentEstimated =
    industrialTotal !== undefined && evapBySpec !== undefined ? Math.max(industrialTotal - evapBySpec, 0) : undefined;

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800">시설배치도</h2>
          <p className="text-xs text-zinc-500">용수 공급원부터 사용처, 배출처까지의 배관 흐름입니다. (선택한 달 기준 계산값 포함)</p>
        </div>
        {availableYMs.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600" htmlFor="facilityYM">
              기준월
            </label>
            <input
              id="facilityYM"
              type="month"
              value={selectedYM}
              min={availableYMs[availableYMs.length - 1]}
              max={availableYMs[0]}
              onChange={(e) => onChangeYM(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
        )}
      </div>

      <PipelineLane
        sourceIcon="🚰"
        sourceLabel="일반용수 (구경 100mm)"
        sourceSub={generalTotal !== undefined ? `${fmtM3(generalTotal)}㎥/월` : undefined}
        supplyColor={PIPE_COLOR.supplyGeneral}
        items={[
          { icon: "🚻", label: "화장실" },
          { icon: "🚿", label: "샤워장" },
          { icon: "🍽️", label: "식당" },
          {
            icon: "🔥",
            label: "보일러",
            sub: [`탱크 ${fmtM3(BOILER_TANK_MONTHLY_M3)}㎥/월`, `자체 ${fmtM3(boilerOwn)}㎥/월(${BOILER_FLOW_RATE_LPH}L/hr)`],
          },
        ]}
        groups={[
          {
            columns: [0, 1, 2],
            dest: "하수처리장",
            annotation:
              sewageComputed !== undefined
                ? [
                    `계산 ${fmtM3(sewageComputed)}㎥`,
                    ...(sewageActual !== undefined ? [`실측 ${fmtM3(sewageActual)}㎥`] : []),
                  ]
                : undefined,
          },
          {
            columns: [3],
            dest: "우수",
            annotation: boilerTotal !== undefined ? [`보일러 계열 ${fmtM3(boilerTotal)}㎥`] : undefined,
          },
        ]}
        onSelectItem={onSelectItem}
        hasSpec={hasSpec}
      />

      <PipelineLane
        sourceIcon="🏭"
        sourceLabel="공업용수"
        sourceSub={industrialTotal !== undefined ? `${fmtM3(industrialTotal)}㎥/월` : undefined}
        supplyColor={PIPE_COLOR.supplyIndustrial}
        items={[
          { icon: "🌀", label: "쿨링타워", sub: [`${COOLING_TOWER_CAPACITY_KCAL_HR.toLocaleString("ko-KR")}kcal/hr`, `${COOLING_TOWER_FLOW_LPM.toLocaleString("ko-KR")}LPM`] },
          { icon: "🔧", label: "피스톤세척기" },
          { icon: "🛢️", label: "바렐세척기" },
          { icon: "📦", label: "박스세척기" },
        ]}
        groups={[
          {
            columns: [0],
            dest: "우수",
            annotation:
              evapByBalance !== undefined || evapBySpec !== undefined
                ? [`실사용 ${fmtM3(evapByBalance)}㎥`, `스펙 ${fmtM3(evapBySpec)}㎥`]
                : undefined,
          },
          {
            columns: [1, 2, 3],
            dest: "폐수",
            annotation:
              effluentActual !== undefined || effluentEstimated !== undefined
                ? [`실측 ${fmtM3(effluentActual)}㎥`, `추정 ${fmtM3(effluentEstimated)}㎥`]
                : undefined,
          },
        ]}
        onSelectItem={onSelectItem}
        hasSpec={hasSpec}
      />

      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs leading-relaxed text-zinc-600">
        <p className="font-medium text-zinc-700">계산 방식 ({selectedYM || "선택 월 없음"} 기준)</p>
        <p className="mt-1.5">
          🔥 보일러 계열은 서로 다른 두 계통이라 따로 계산: 옆 온수탱크 보충수 <b>{fmtM3(BOILER_TANK_MONTHLY_M3)}㎥(360톤, 실측 고정값)</b> +
          보일러 자체 <b>{fmtM3(boilerOwn)}㎥</b>(유량 {BOILER_FLOW_RATE_LPH}L/hr × 24시간 × 해당월 일수, 24시간 연속가동 가정) ={" "}
          <b>{fmtM3(boilerTotal)}㎥</b>
        </p>
        <p className="mt-1">
          🚻 하수처리장 = 일반용수 {fmtM3(generalTotal)}㎥ − 보일러 계열 합계 {fmtM3(boilerTotal)}㎥ = <b>{fmtM3(sewageComputed)}㎥</b>{" "}
          (화장실·샤워장·식당 합산분){" "}
          {sewageActual !== undefined && (
            <span className="text-zinc-400">— 실측값(업로드 파일 배출 데이터)은 {fmtM3(sewageActual)}㎥</span>
          )}
        </p>
        {sewageTheoreticalFromFixtures !== undefined && (
          <p className="mt-1">
            🚽 화장실·샤워장·식당 기구 목록 기준 이론 사용량 ≈ <b>{fmtM3(sewageTheoreticalFromFixtures, 2)}㎥/월</b>{" "}
            <span className="text-zinc-400">
              (등록한 기구별 대수×1회사용량×1일사용횟수 합산, 30일 기준) — 위 하수처리장 값과 차이가 크면 각 기구의
              &quot;1일 사용횟수&quot;를 조정해가며 맞춰보면 실제 이용 빈도를 역산할 수 있음
            </span>
          </p>
        )}
        <p className="mt-1">
          🌀 쿨링타워 증발량(실사용 기준) = 공업용수 {fmtM3(industrialTotal)}㎥ − 폐수 실측 {fmtM3(effluentActual)}㎥ ={" "}
          <b>{fmtM3(evapByBalance)}㎥</b>
        </p>
        <p className="mt-1">
          🌀 쿨링타워 증발량(설비 스펙 기준) = 냉각용량 {COOLING_TOWER_CAPACITY_KCAL_HR.toLocaleString("ko-KR")}kcal/hr ÷ 증발잠열{" "}
          {LATENT_HEAT_KCAL_PER_KG}kcal/kg(국내 냉각탑 설계 표준값) × 24시간 × {selectedYM ? "해당월 일수" : "-"} ≈{" "}
          <b>{fmtM3(evapBySpec)}㎥/월</b>{" "}
          <span className="text-zinc-400">(순환수 {COOLING_TOWER_FLOW_LPM.toLocaleString("ko-KR")}LPM 대비 증발률 약 {evapRatePercent.toFixed(2)}% — 통상 0.5~1.5% 범위와 비슷하면 추정이 합리적)</span>
        </p>
        <p className="mt-1 text-zinc-400">
          * 스펙 정합성 참고: &quot;냉각능력 1톤당 순환수 3GPM&quot;이라는 국내외 공통 설계기준으로
          역산하면 이 냉각탑은 이론상 약 {expectedFlowLpmFromCapacity().toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
          LPM 순환이 기대되는데, 실제 스펙({COOLING_TOWER_FLOW_LPM.toLocaleString("ko-KR")}LPM)과 비슷해 입력한 스펙 자체가 서로 정합적입니다.
        </p>
        <p className="mt-1">
          🧪 폐수 = 실측(업로드 파일) <b>{fmtM3(effluentActual)}㎥</b> · 추정(공업용수 {fmtM3(industrialTotal)}㎥ − 스펙기준 증발량{" "}
          {fmtM3(evapBySpec)}㎥) <b>{fmtM3(effluentEstimated)}㎥</b>
        </p>
        <p className="mt-1.5 text-zinc-400">
          * 증발량·폐수 모두 두 가지 계산치가 비슷한 범위로 나오면 서로 교차검증이 되는 것이고, 크게 어긋나면 폐수 실측값이나 가동시간 가정을 다시 확인해야 합니다.
        </p>
      </div>
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

  // 최신 달이 위로 오게 내림차순 — 오래된 달은 세부 항목(일반/공업용수) 구분이 아예 없는 경우가
  // 있어, 오름차순으로 두면 화면 맨 위가 비어 보여 "데이터가 없어졌다"고 오해하기 쉽다.
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function fmt(v: number | undefined): string {
  if (v === undefined) return "-";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function sum(rows: Row[], field: "general" | "industrial" | "sewage" | "effluent"): number {
  return rows.reduce((acc, r) => acc + (r[field] ?? 0), 0);
}

// 회수율 = 일반용수 사용량 중 하수처리장으로 배출(회수)된 비율. 보일러(증기 손실)처럼
// 하수처리장으로 가지 않는 몫이 있어 100%보다 낮게 나오는 게 정상이다.
function recoveryRate(sewage: number | undefined, general: number | undefined): number | undefined {
  if (sewage === undefined || general === undefined || general === 0) return undefined;
  return (sewage / general) * 100;
}

function fmtPercent(v: number | undefined): string {
  if (v === undefined) return "-";
  return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

// 여러 종류의 기구가 섞여 있는 시설 — 이 시설들만 "기구 목록" 편집 UI를 쓴다.
// 나머지(보일러/쿨링타워/세척기 등)는 단일 설비라 기존 대수·제품·용수사용량 폼 그대로 쓴다.
const FIXTURE_FACILITIES = new Set(["화장실", "샤워장", "식당"]);
const ASSUMED_DAYS_PER_MONTH = 30; // 이론 월 사용량 환산용 — 실제 선택월 일수와는 별개의 참고치

function newFixture(): FixtureEntry {
  const type: FixtureType = "대변기";
  return {
    id: crypto.randomUUID(),
    type,
    quantity: 1,
    unitUsageL: FIXTURE_PRESETS[type]?.defaultUnitUsageL ?? 0,
  };
}

function fixtureMonthlyM3(f: FixtureEntry): number {
  if (!f.usesPerDayPerUnit) return 0;
  return (f.quantity * f.unitUsageL * f.usesPerDayPerUnit * ASSUMED_DAYS_PER_MONTH) / 1000;
}

/** 기구 목록 한 줄 — 종류/대수/1회사용량/1일사용횟수를 편집. */
function FixtureRow({ fixture, onChange, onRemove }: { fixture: FixtureEntry; onChange: (next: FixtureEntry) => void; onRemove: () => void }) {
  const preset = FIXTURE_PRESETS[fixture.type];
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-zinc-200 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={fixture.type}
          onChange={(e) => {
            const type = e.target.value as FixtureType;
            const p = FIXTURE_PRESETS[type];
            onChange({ ...fixture, type, unitUsageL: p ? p.defaultUnitUsageL : fixture.unitUsageL });
          }}
          className="rounded border border-zinc-300 px-2 py-1 text-xs"
        >
          {FIXTURE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {fixture.type === "기타" && (
          <input
            type="text"
            value={fixture.customTypeName ?? ""}
            onChange={(e) => onChange({ ...fixture, customTypeName: e.target.value })}
            placeholder="기구명 직접입력"
            className="w-24 rounded border border-zinc-300 px-2 py-1 text-xs"
          />
        )}
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          대수
          <input
            type="number"
            min={0}
            value={fixture.quantity}
            onChange={(e) => onChange({ ...fixture, quantity: Number(e.target.value) })}
            className="w-14 rounded border border-zinc-300 px-1.5 py-1 text-xs"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          1회(L)
          <input
            type="number"
            min={0}
            step={0.1}
            value={fixture.unitUsageL}
            onChange={(e) => onChange({ ...fixture, unitUsageL: Number(e.target.value) })}
            className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-xs"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-500">
          1일 사용횟수(대당)
          <input
            type="number"
            min={0}
            value={fixture.usesPerDayPerUnit ?? ""}
            onChange={(e) => onChange({ ...fixture, usesPerDayPerUnit: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="모름"
            className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-xs"
          />
        </label>
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-red-500 hover:underline">
          삭제
        </button>
      </div>
      {preset && <p className="text-[11px] text-zinc-400">{preset.sourceNote}</p>}
    </div>
  );
}

// -------------------------------------------
// 세부시설항목 입력 모달 — 시설배치도의 각 사용처 박스를 클릭하면 뜬다.
// 화장실/샤워장/식당은 기구 목록(종류별 대수+이론사용량+사용횟수), 그 외 단일 설비는
// 기존 대수/제품/용수사용량/비고 입력을 쓴다. (추후 용수사용량 역산에 쓸 원자료.)
// -------------------------------------------
function FacilityDetailModal({
  facility,
  spec,
  saving,
  onSave,
  onClose,
}: {
  facility: string;
  spec: FacilitySpec;
  saving: boolean;
  onSave: (next: FacilitySpec) => void;
  onClose: () => void;
}) {
  const isFixtureFacility = FIXTURE_FACILITIES.has(facility);

  const [quantity, setQuantity] = useState(spec.quantity !== undefined ? String(spec.quantity) : "");
  const [model, setModel] = useState(spec.model ?? "");
  const [waterUsage, setWaterUsage] = useState(spec.waterUsage ?? "");
  const [note, setNote] = useState(spec.note ?? "");
  const [fixtures, setFixtures] = useState<FixtureEntry[]>(spec.fixtures ?? []);

  const theoreticalMonthlyM3 = useMemo(() => fixtures.reduce((sum, f) => sum + fixtureMonthlyM3(f), 0), [fixtures]);
  const hasAnyFrequency = fixtures.some((f) => f.usesPerDayPerUnit);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-800">{facility} — 세부시설항목</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-zinc-500">추후 용수사용량 역산에 쓰일 자료입니다. 아는 만큼만 입력해도 됩니다.</p>

        {isFixtureFacility ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {fixtures.length === 0 && (
                <p className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-400">
                  아직 등록된 기구가 없습니다. 아래에서 추가하세요.
                </p>
              )}
              {fixtures.map((f) => (
                <FixtureRow
                  key={f.id}
                  fixture={f}
                  onChange={(next) => setFixtures((prev) => prev.map((x) => (x.id === f.id ? next : x)))}
                  onRemove={() => setFixtures((prev) => prev.filter((x) => x.id !== f.id))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFixtures((prev) => [...prev, newFixture()])}
              className="w-fit rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              + 기구 추가
            </button>

            <div className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              이론 월 사용량 ≈ <b>{theoreticalMonthlyM3.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}㎥</b>
              {!hasAnyFrequency && fixtures.length > 0 && (
                <span className="text-zinc-400"> (1일 사용횟수를 입력한 기구가 없어 0으로 계산됨)</span>
              )}
              <span className="block text-zinc-400">* 30일 기준 환산. 실제 배출 실적과 비교해가며 사용횟수를 조정해보세요.</span>
            </div>

            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              비고
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="설치 위치, 사용 패턴 등 자유롭게"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800"
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              대수
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="예: 3"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              제품(모델명)
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="예: OO양변기 OO모델"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              용수 사용량
              <input
                type="text"
                value={waterUsage}
                onChange={(e) => setWaterUsage(e.target.value)}
                placeholder="예: 1대당 200L/hr, 1회당 6L 등"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              비고
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="설치 위치, 사용 패턴 등 자유롭게"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800"
              />
            </label>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onSave(
                isFixtureFacility
                  ? { fixtures: fixtures.length > 0 ? fixtures : undefined, note: note.trim() || undefined }
                  : {
                      quantity: quantity.trim() ? Number(quantity) : undefined,
                      model: model.trim() || undefined,
                      waterUsage: waterUsage.trim() || undefined,
                      note: note.trim() || undefined,
                    }
              )
            }
            className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WaterManagement({
  summary,
  initialFacilitySpecs,
}: {
  summary: KpiSummary | null;
  initialFacilitySpecs?: FacilitySpecs;
}) {
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

  // allRows는 최신 달이 먼저 오도록 내림차순 정렬돼 있다 (buildRows 참고).
  const maxYM = allRows[0]?.ym ?? "";
  const minYM = allRows[allRows.length - 1]?.ym ?? "";
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const effectiveStart = rangeStart || minYM;
  const effectiveEnd = rangeEnd || maxYM;
  const isFullRange = effectiveStart === minYM && effectiveEnd === maxYM;

  const rows = useMemo(
    () => allRows.filter((r) => (!effectiveStart || r.key >= effectiveStart) && (!effectiveEnd || r.key <= effectiveEnd)),
    [allRows, effectiveStart, effectiveEnd]
  );

  // 시설배치도의 "기준월" — 표의 기간 선택과는 별개로, 배관 위 계산값에 쓸 단일 월을 고른다.
  const availableYMs = useMemo(() => allRows.map((r) => r.ym), [allRows]);
  const [facilityYM, setFacilityYM] = useState("");
  const effectiveFacilityYM = facilityYM || maxYM;
  const facilityRow = allRows.find((r) => r.ym === effectiveFacilityYM);

  // 세부시설항목(대수/제품/용수사용량/비고) — 시설배치도 박스를 클릭하면 입력창이 뜬다.
  const [specs, setSpecs] = useState<FacilitySpecs>(initialFacilitySpecs ?? {});
  const [editingFacility, setEditingFacility] = useState<string | null>(null);
  const [savingSpec, setSavingSpec] = useState(false);

  function hasSpec(label: string): boolean {
    const s = specs[label];
    return !!s && (s.quantity !== undefined || !!s.model || !!s.waterUsage || !!s.note || !!s.fixtures?.length);
  }

  async function saveSpec(next: FacilitySpec) {
    if (!editingFacility) return;
    setSavingSpec(true);
    try {
      const nextSpecs = { ...specs, [editingFacility]: next };
      const res = await fetch("/api/kpi/facility-specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSpecs),
      });
      if (res.ok) {
        setSpecs(await res.json());
        setEditingFacility(null);
      }
    } finally {
      setSavingSpec(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <FacilityLayout
        availableYMs={availableYMs}
        selectedYM={effectiveFacilityYM}
        onChangeYM={setFacilityYM}
        generalTotal={facilityRow?.general}
        industrialTotal={facilityRow?.industrial}
        sewageActual={facilityRow?.sewage}
        effluentActual={facilityRow?.effluent}
        onSelectItem={setEditingFacility}
        hasSpec={hasSpec}
        specs={specs}
      />

      {editingFacility && (
        <FacilityDetailModal
          facility={editingFacility}
          spec={specs[editingFacility] ?? {}}
          saving={savingSpec}
          onSave={saveSpec}
          onClose={() => setEditingFacility(null)}
        />
      )}

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
                  <th rowSpan={2} className="border-b border-zinc-200 px-3 py-2 text-right font-medium align-bottom">
                    회수율(%)
                  </th>
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
                    <td className="px-3 py-2 text-right font-medium text-blue-700">{fmtPercent(recoveryRate(r.sewage, r.general))}</td>
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
                  <td className="px-3 py-2 text-right text-blue-700">{fmtPercent(recoveryRate(sum(rows, "sewage"), sum(rows, "general")))}</td>
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
