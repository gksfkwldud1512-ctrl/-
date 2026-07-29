"use client";

import { useMemo, useState } from "react";
import type { KpiSummary, MonthlyPoint, SeriesKey } from "@/lib/kpi/parseDetails";
import { computeIntensity } from "@/lib/kpi/intensity";
import { computeTTM, computeTTMIntensity } from "@/lib/kpi/ttm";
import { LineChart, type ChartSeries } from "@/components/LineChart";
import { KpiTable } from "@/components/KpiTable";

function sortChrono(points: MonthlyPoint[]): MonthlyPoint[] {
  return [...points].sort((a, b) => a.calendarYear - b.calendarYear || a.monthNumber - b.monthNumber);
}

function toChartPoints(points: MonthlyPoint[], showYear: boolean) {
  return sortChrono(points).map((p) => ({
    label: showYear ? `${p.month}'${p.fiscalYear.slice(2, 4)}` : p.month,
    value: p.value,
  }));
}

function ChartCard({
  title,
  unit,
  monthly,
  ttm,
  decimals,
  showYear,
}: {
  title: string;
  unit: string;
  monthly: MonthlyPoint[];
  ttm: MonthlyPoint[];
  decimals: number;
  showYear: boolean;
}) {
  const series: ChartSeries[] = [
    { name: "12개월 누적", points: toChartPoints(ttm, showYear) },
    { name: "월별", points: toChartPoints(monthly, showYear) },
  ];
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="font-semibold text-sm mb-2">
        {title} <span className="text-xs font-normal text-zinc-400">({unit})</span>
      </h3>
      <LineChart series={series} unit={unit} decimals={decimals} />
    </div>
  );
}

/** 합계 표 + "하위 항목 보기"를 누르면 구성 내역(MEASURES 단위) 표들이 펼쳐지는 카드. */
function BreakdownTable({
  title,
  unit,
  total,
  breakdown,
  filterByRange,
  decimals,
}: {
  title: string;
  unit: string;
  total: MonthlyPoint[];
  breakdown: Record<string, MonthlyPoint[]>;
  filterByRange: <T extends MonthlyPoint>(points: T[]) => T[];
  decimals: number;
}) {
  const [open, setOpen] = useState(false);
  const measureNames = useMemo(
    () =>
      Object.entries(breakdown)
        .sort((a, b) => {
          const sumA = a[1].reduce((acc, p) => acc + p.value, 0);
          const sumB = b[1].reduce((acc, p) => acc + p.value, 0);
          return sumB - sumA;
        })
        .map(([name]) => name),
    [breakdown]
  );

  return (
    <div className="flex flex-col gap-2">
      <KpiTable title={title} unit={unit} points={total} decimals={decimals} />
      {measureNames.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-fit rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
          >
            {open ? "하위 항목 숨기기 ▲" : `하위 항목 보기 (${measureNames.length}개) ▼`}
          </button>
          {open && (
            <div className="flex flex-col gap-3 border-l-2 border-zinc-200 pl-4">
              {measureNames.map((name) => (
                <KpiTable
                  key={name}
                  title={name}
                  unit={unit}
                  points={filterByRange(breakdown[name])}
                  decimals={decimals}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
function ymToNum(v: string): number {
  const [y, m] = v.split("-").map(Number);
  return y * 100 + m;
}

export function KpiDashboard({ summary }: { summary: KpiSummary | null }) {
  const series = summary?.series;

  const fiscalYears = useMemo(() => {
    if (!series) return [];
    const all = (Object.keys(series) as SeriesKey[]).flatMap((k) => series[k].map((p) => p.fiscalYear));
    return Array.from(new Set(all)).sort();
  }, [series]);

  const { minYM, maxYM } = useMemo(() => {
    if (!series) return { minYM: "", maxYM: "" };
    const all = (Object.keys(series) as SeriesKey[]).flatMap((k) => series[k]);
    if (all.length === 0) return { minYM: "", maxYM: "" };
    let min = all[0], max = all[0];
    for (const p of all) {
      if (p.calendarYear * 100 + p.monthNumber < min.calendarYear * 100 + min.monthNumber) min = p;
      if (p.calendarYear * 100 + p.monthNumber > max.calendarYear * 100 + max.monthNumber) max = p;
    }
    return { minYM: ym(min.calendarYear, min.monthNumber), maxYM: ym(max.calendarYear, max.monthNumber) };
  }, [series]);

  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");
  const effectiveStart = rangeStart || minYM;
  const effectiveEnd = rangeEnd || maxYM;

  const energyIntensity = series ? computeIntensity(series.energy, series.salesUSD) : [];
  const wasteIntensity = series ? computeIntensity(series.waste, series.salesUSD) : [];
  const waterIntensity = series ? computeIntensity(series.water, series.salesUSD) : [];

  const energyIntensityTTM = series ? computeTTMIntensity(series.energy, series.salesUSD) : [];
  const wasteIntensityTTM = series ? computeTTMIntensity(series.waste, series.salesUSD) : [];
  const waterIntensityTTM = series ? computeTTMIntensity(series.water, series.salesUSD) : [];
  const scope1TTM = series ? computeTTM(series.scope1) : [];
  const scope2TTM = series ? computeTTM(series.scope2) : [];

  function filterByRange<T extends MonthlyPoint>(points: T[]): T[] {
    if (!effectiveStart || !effectiveEnd) return points;
    const startNum = ymToNum(effectiveStart);
    const endNum = ymToNum(effectiveEnd);
    return points.filter((p) => {
      const n = p.calendarYear * 100 + p.monthNumber;
      return n >= startNum && n <= endNum;
    });
  }

  const isFullRange = effectiveStart === minYM && effectiveEnd === maxYM;
  const showYearInLabel = true;

  if (!summary) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-400">
        아직 업로드된 데이터가 없습니다. 아래에서 DETAILS 파일을 업로드해 주세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-600" htmlFor="rangeStart">
            시작 연월
          </label>
          <input
            id="rangeStart"
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
          <label className="text-xs font-medium text-zinc-600" htmlFor="rangeEnd">
            종료 연월
          </label>
          <input
            id="rangeEnd"
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
        <div className="mb-1 flex flex-wrap gap-1">
          {fiscalYears.map((fy) => {
            const [y1, y2] = fy.split("/");
            const s = ym(Number(y1), 4);
            const e = ym(Number(y2), 3);
            return (
              <button
                key={fy}
                type="button"
                onClick={() => {
                  setRangeStart(s);
                  setRangeEnd(e);
                }}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${effectiveStart === s && effectiveEnd === e ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
              >
                {fy}
              </button>
            );
          })}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="에너지 강도"
          unit="GJ/MUSD"
          monthly={filterByRange(energyIntensity)}
          ttm={filterByRange(energyIntensityTTM)}
          decimals={1}
          showYear={showYearInLabel}
        />
        <ChartCard
          title="폐기물 강도"
          unit="ton/MUSD"
          monthly={filterByRange(wasteIntensity)}
          ttm={filterByRange(wasteIntensityTTM)}
          decimals={2}
          showYear={showYearInLabel}
        />
        <ChartCard
          title="용수 강도"
          unit="㎥/MUSD"
          monthly={filterByRange(waterIntensity)}
          ttm={filterByRange(waterIntensityTTM)}
          decimals={1}
          showYear={showYearInLabel}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:contents">
          <ChartCard
            title="Scope 1 배출량"
            unit="tCO2e"
            monthly={filterByRange(series?.scope1 ?? [])}
            ttm={filterByRange(scope1TTM)}
            decimals={1}
            showYear={showYearInLabel}
          />
          <ChartCard
            title="Scope 2 배출량"
            unit="tCO2e"
            monthly={filterByRange(series?.scope2 ?? [])}
            ttm={filterByRange(scope2TTM)}
            decimals={1}
            showYear={showYearInLabel}
          />
        </div>
      </section>
      {!isFullRange && (
        <p className="text-xs text-zinc-400">
          * &quot;12개월 누적&quot; 선은 선택한 기간 이전 실측월도 포함해 계산한 값입니다(표시만 {effectiveStart}~{effectiveEnd} 구간).
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-zinc-800">강도 지표 &amp; 온실가스 배출량 (표)</h2>
        <KpiTable title="에너지 강도 (총 에너지사용량 GJ / 매출액 MUSD)" unit="GJ/MUSD" points={filterByRange(energyIntensity)} decimals={1} />
        <KpiTable title="폐기물 강도 (폐기물 발생량 ton / 매출액 MUSD)" unit="ton/MUSD" points={filterByRange(wasteIntensity)} decimals={2} />
        <KpiTable title="용수 강도 (총용수사용량 ㎥ / 매출액 MUSD)" unit="㎥/MUSD" points={filterByRange(waterIntensity)} decimals={1} />
        <KpiTable title="Scope 1 배출량" unit="tCO2e" points={filterByRange(series?.scope1 ?? [])} decimals={1} />
        <KpiTable title="Scope 2 배출량" unit="tCO2e" points={filterByRange(series?.scope2 ?? [])} decimals={1} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-zinc-800">항목별 월별 사용량</h2>
        <BreakdownTable
          title="에너지 사용량"
          unit="GJ"
          total={filterByRange(series?.energy ?? [])}
          breakdown={summary.breakdown.energy}
          filterByRange={filterByRange}
          decimals={0}
        />
        <BreakdownTable
          title="폐기물 발생량"
          unit="ton"
          total={filterByRange(series?.waste ?? [])}
          breakdown={summary.breakdown.waste}
          filterByRange={filterByRange}
          decimals={2}
        />
        <BreakdownTable
          title="용수 사용량"
          unit="㎥"
          total={filterByRange(series?.water ?? [])}
          breakdown={summary.breakdown.water}
          filterByRange={filterByRange}
          decimals={0}
        />
      </section>
    </div>
  );
}
