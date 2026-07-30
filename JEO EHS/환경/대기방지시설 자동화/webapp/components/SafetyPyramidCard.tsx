"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FISCAL_MONTHS } from "@/lib/kpi/parseDetails";
import {
  SAFETY_CATEGORIES,
  computePyramidStats,
  pyramidArrow,
  pyramidColorHex,
  pyramidWidthFrac,
  type SafetyMonthly,
  type SafetyTargets,
} from "@/lib/kpi/safetyPyramid";

const KO_MONTH: Record<string, string> = {
  Apr: "4월", May: "5월", Jun: "6월", Jul: "7월", Aug: "8월", Sep: "9월",
  Oct: "10월", Nov: "11월", Dec: "12월", Jan: "1월", Feb: "2월", Mar: "3월",
};

const ARROW_GLYPH: Record<"up" | "right" | "down", string> = { up: "▲", right: "▶", down: "▼" };

function cloneMonthly(monthly: SafetyMonthly): SafetyMonthly {
  const next = {} as SafetyMonthly;
  for (const c of SAFETY_CATEGORIES) next[c.key] = { ...monthly[c.key] };
  return next;
}

function cloneTargets(targets: SafetyTargets): SafetyTargets {
  return { ...targets };
}

// 웹페이지 미리보기용 SVG 안전 피라미드 — 원본 캡처(엑셀 SAFETY PYRAMID 대시보드)를 픽셀 단위로
// 분석해서 확정한 구조 그대로: 오른쪽 변이 전체 높이에서 고정된 수직선이고, 왼쪽 변만 맨 위(중대재해)의
// 뾰족한 정점(폭 0)에서 맨 아래(선행지표)로 벌어지는 대각선이다. 라벨은 그 고정된 오른쪽 끝에
// 오른쪽 정렬로 배치돼서, 폭이 좁은 위쪽 단에서는 도형 왼쪽 바깥 흰 여백에 자연스럽게 놓이고
// 폭이 넓은 아래쪽 단에서는 도형 위에 그대로 겹쳐진다(검정 굵은 글씨, 모든 색상에서 가독성 확보).
function PyramidSvg({ monthly, targets }: { monthly: SafetyMonthly; targets: SafetyTargets }) {
  const stats = computePyramidStats({ monthly, targets, updatedAt: "" });
  const count = SAFETY_CATEGORIES.length;

  const pyramidW = 200;
  const viewW = pyramidW;
  const viewH = 210;
  const bandH = viewH / count;
  const rightX = pyramidW; // 고정된 오른쪽(수직) 변 x좌표

  const boundaryWidth = (j: number) => pyramidW * pyramidWidthFrac(j, count);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox={`0 0 ${viewW} ${viewH}`} className="h-auto w-full max-w-xs">
        {stats.map((s, i) => {
          const yTop = i * bandH;
          const yBottom = yTop + bandH;
          const yMid = (yTop + yBottom) / 2;
          const topLeft = rightX - boundaryWidth(i);
          const bottomLeft = rightX - boundaryWidth(i + 1);
          const points = [
            [rightX, yTop],
            [topLeft, yTop],
            [bottomLeft, yBottom],
            [rightX, yBottom],
          ]
            .map((p) => p.join(","))
            .join(" ");
          return (
            <g key={s.key}>
              <polygon points={points} fill={`#${pyramidColorHex(i)}`} stroke="#ffffff" strokeWidth={1.5} />
              <text x={rightX - 4} y={yMid} textAnchor="end" dominantBaseline="middle" fontSize={11} fontWeight={700} fill="#222222">
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// 원본 캡처와 동일한 4컬럼(실적·목표YTD·목표·목표%) + 화살표 표. 목표 개념이 있는 아차사고·
// 유해위험요인 두 행만 값이 채워지고(연간 목표는 여기서 직접 입력), 나머지 4행은 실적만 표시된다.
function SummaryTable({
  monthly,
  targets,
  onTargetChange,
}: {
  monthly: SafetyMonthly;
  targets: SafetyTargets;
  onTargetChange: (key: (typeof SAFETY_CATEGORIES)[number]["key"], value: string) => void;
}) {
  const stats = computePyramidStats({ monthly, targets, updatedAt: "" });

  return (
    <table className="w-full text-xs">
      <thead className="bg-zinc-50 text-zinc-500">
        <tr>
          <th className="px-2 py-2 text-left font-medium whitespace-nowrap">구분</th>
          <th className="px-2 py-2 text-center font-medium whitespace-nowrap">실적(누적)</th>
          <th className="px-1 py-2 text-center font-medium whitespace-nowrap"></th>
          <th className="px-2 py-2 text-center font-medium whitespace-nowrap">목표 YTD</th>
          <th className="px-2 py-2 text-center font-medium whitespace-nowrap bg-amber-50">연간 목표(입력)</th>
          <th className="px-2 py-2 text-center font-medium whitespace-nowrap">달성률</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {stats.map((s) => {
          const arrow = pyramidArrow(s.actual, s.targetYtd);
          return (
            <tr key={s.key}>
              <td className="px-2 py-1.5 font-medium text-zinc-700 whitespace-nowrap">{s.label}</td>
              <td className="px-2 py-1.5 text-center">{s.actual}</td>
              <td className="px-1 py-1.5 text-center font-bold" style={{ color: arrow ? `#${arrow.color}` : undefined }}>
                {arrow ? ARROW_GLYPH[arrow.dir] : ""}
              </td>
              <td className="px-2 py-1.5 text-center">{s.hasTarget ? s.targetYtd : "-"}</td>
              <td className="px-2 py-1.5 text-center bg-amber-50">
                {s.hasTarget ? (
                  <input
                    type="number"
                    value={targets[s.key] || ""}
                    onChange={(e) => onTargetChange(s.key, e.target.value)}
                    className="w-16 rounded border border-zinc-300 px-1 py-0.5 text-center text-xs"
                  />
                ) : (
                  "-"
                )}
              </td>
              <td className="px-2 py-1.5 text-center">{s.hasTarget && s.achievedPct !== null ? `${s.achievedPct}%` : "-"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SafetyPyramidCard({
  monthly,
  targets,
  updatedAt,
}: {
  monthly: SafetyMonthly;
  targets: SafetyTargets;
  updatedAt: string;
}) {
  const router = useRouter();
  const [draftMonthly, setDraftMonthly] = useState<SafetyMonthly>(monthly);
  const [draftTargets, setDraftTargets] = useState<SafetyTargets>(targets);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function updateCell(catKey: (typeof SAFETY_CATEGORIES)[number]["key"], month: (typeof FISCAL_MONTHS)[number], value: string) {
    setDraftMonthly((prev) => {
      const next = cloneMonthly(prev);
      const row = next[catKey];
      if (value.trim() === "") {
        delete row[month];
      } else {
        const n = Number(value);
        if (Number.isFinite(n)) row[month] = n;
      }
      return next;
    });
    setDirty(true);
  }

  function updateTarget(catKey: (typeof SAFETY_CATEGORIES)[number]["key"], value: string) {
    setDraftTargets((prev) => {
      const next = cloneTargets(prev);
      const n = Number(value);
      next[catKey] = value.trim() === "" || !Number.isFinite(n) ? 0 : n;
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/kpi/safety-pyramid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly: draftMonthly, targets: draftTargets }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "저장에 실패했습니다.");
      }
      setDirty(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-800">안전 피라미드</h2>
        <p className="mt-1 text-xs text-zinc-500">
          아래에서 월별 실적을 입력하고, 아차사고·유해위험요인의 "연간 목표(입력)" 칸에 목표 건수를 넣으면
          목표 YTD·달성률·화살표가 자동 계산되고 게시용 자료(PPT) 1번 슬라이드에도 동일하게 반영됩니다.
          {updatedAt && ` 마지막 업데이트: ${new Date(updatedAt).toLocaleString("ko-KR")}`}
        </p>
      </div>

      <div className="flex flex-col items-start gap-4 md:flex-row">
        <div className="w-full shrink-0 md:w-56">
          <PyramidSvg monthly={draftMonthly} targets={draftTargets} />
        </div>

        <div className="w-full overflow-x-auto">
          <SummaryTable monthly={draftMonthly} targets={draftTargets} onTargetChange={updateTarget} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <p className="mb-1 text-xs font-medium text-zinc-500">월별 실적 입력</p>
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="sticky left-0 bg-zinc-50 px-2 py-2 text-left font-medium">구분</th>
              {FISCAL_MONTHS.map((m) => (
                <th key={m} className="px-1 py-2 text-center font-medium whitespace-nowrap">{KO_MONTH[m]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {SAFETY_CATEGORIES.map((cat) => (
              <tr key={cat.key}>
                <td className="sticky left-0 bg-white px-2 py-1.5 font-medium text-zinc-700 whitespace-nowrap">{cat.label}</td>
                {FISCAL_MONTHS.map((m) => (
                  <td key={m} className="px-1 py-1.5">
                    <input
                      type="number"
                      value={draftMonthly[cat.key][m] ?? ""}
                      onChange={(e) => updateCell(cat.key, m, e.target.value)}
                      className="w-14 rounded border border-zinc-200 px-1 py-0.5 text-center text-xs"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "저장 중..." : "실적/목표 저장"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
