"use client";

import { useState } from "react";

// 팔레트: dataviz 스킬 참조 팔레트의 카테고리 슬롯 1(blue)/2(orange) — 2개 계열 고정 배정.
const SERIES_COLORS = ["#2a78d6", "#eb6834"];

export type ChartPoint = { label: string; value: number };
export type ChartSeries = { name: string; points: ChartPoint[] };

export function LineChart({
  series,
  unit,
  decimals = 1,
  height = 220,
}: {
  series: ChartSeries[];
  unit: string;
  decimals?: number;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxLen = Math.max(0, ...series.map((s) => s.points.length));
  if (maxLen === 0) {
    return <p className="text-xs text-zinc-400 py-8 text-center">데이터가 없습니다.</p>;
  }

  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const minV = Math.min(0, ...allValues);
  const maxV = Math.max(...allValues, 0.0001);

  // 점이 너무 많으면(넓은 기간) 값 라벨을 다 붙였을 때 서로 겹쳐 못 읽으므로,
  // 촘촘하지 않을 때만(대략 2년 이내) 각 점 위/아래에 실제 숫자를 직접 표시한다.
  const showValueLabels = maxLen <= 24;

  const width = 640;
  const padL = 44;
  const padR = 12;
  const padT = showValueLabels ? 24 : 12;
  const padB = showValueLabels ? 36 : 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xAt = (i: number) => padL + (maxLen === 1 ? plotW / 2 : (i / (maxLen - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - ((v - minV) / (maxV - minV)) * plotH;

  // 점 개수가 많아지면(전체 연도 보기) 겹치지 않도록 마커를 줄인다.
  const dotR = maxLen > 36 ? 2 : maxLen > 16 ? 3 : 4.5;

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => minV + ((maxV - minV) * i) / yTicks);

  const labels = series.find((s) => s.points.length === maxLen)?.points.map((p) => p.label) ?? [];
  // x축 라벨은 겹치지 않게 최대 12개 정도만 골라 표시
  const labelStep = Math.max(1, Math.ceil(maxLen / 12));

  return (
    <div>
      <div className="flex items-center gap-4 mb-1">
        {series.map((s, i) => (
          <div key={s.name} className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLORS[i] }} />
            {s.name}
          </div>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width;
          const idx = Math.round(((relX - padL) / plotW) * (maxLen - 1));
          setHoverIdx(Math.min(maxLen - 1, Math.max(0, idx)));
        }}
      >
        {tickVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={yAt(v)} y2={yAt(v)} stroke="#e1e0d9" strokeWidth={1} />
            <text x={padL - 6} y={yAt(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#898781">
              {v.toLocaleString("ko-KR", { maximumFractionDigits: decimals })}
            </text>
          </g>
        ))}

        {labels.map((label, i) =>
          i % labelStep === 0 ? (
            <text key={i} x={xAt(i)} y={height - 6} textAnchor="middle" fontSize={9} fill="#898781">
              {label}
            </text>
          ) : null
        )}

        {series.map((s, si) => {
          const path = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.value)}`).join(" ");
          // 첫 번째 계열(12개월 누적)은 점 위에, 두 번째 계열(월별)은 점 아래에 라벨을 붙여
          // 두 선이 겹치는 구간에서도 숫자끼리 부딪히지 않게 한다.
          const labelDy = si === 0 ? -8 : 14;
          return (
            <g key={s.name}>
              <path d={path} fill="none" stroke={SERIES_COLORS[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.points.map((p, i) => (
                <g key={i}>
                  <circle cx={xAt(i)} cy={yAt(p.value)} r={dotR} fill={SERIES_COLORS[si]} stroke="#fcfcfb" strokeWidth={2} />
                  {showValueLabels && (
                    <text
                      x={xAt(i)}
                      y={yAt(p.value) + labelDy}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#52514e"
                    >
                      {p.value.toLocaleString("ko-KR", { maximumFractionDigits: decimals })}
                    </text>
                  )}
                </g>
              ))}
            </g>
          );
        })}

        {hoverIdx !== null && (
          <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={padT} y2={padT + plotH} stroke="#c3c2b7" strokeWidth={1} />
        )}
      </svg>
      {!showValueLabels && (
        <p className="mt-1 text-[10px] text-zinc-400">
          기간이 넓어 숫자가 겹쳐 보이지 않습니다 — 위 기간 선택에서 좁혀보거나 아래 표에서 정확한 값을 확인하세요.
        </p>
      )}
      {hoverIdx !== null && labels[hoverIdx] && (
        <div className="mt-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm inline-block">
          <div className="font-medium text-zinc-700 mb-1">{labels[hoverIdx]}</div>
          {series.map((s, i) =>
            s.points[hoverIdx] ? (
              <div key={s.name} className="flex items-center gap-1.5 text-zinc-600">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[i] }} />
                {s.name}: {s.points[hoverIdx].value.toLocaleString("ko-KR", { maximumFractionDigits: decimals })} {unit}
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
