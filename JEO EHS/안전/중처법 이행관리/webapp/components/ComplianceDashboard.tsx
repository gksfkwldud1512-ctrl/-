"use client";

import { useMemo, useState } from "react";
import { COMPLIANCE_CATEGORIES } from "@/lib/complianceItems";
import { computeComplianceStats, computeOverallRate, type ChecklistTask, type ComplianceData } from "@/lib/complianceData";
import { ComplianceDonut } from "./ComplianceDonut";
import { CategoryDetail } from "./CategoryDetail";
import { RiskAssessmentPanel } from "./RiskAssessmentPanel";

// 항목별로 범용 체크리스트(CategoryDetail) 대신 전용 화면을 쓸 경우 여기에 등록한다.
// 지금은 4-3(위험성평가)만 커스터마이징돼 있고, 나머지는 계속 범용 화면을 쓴다.
const CUSTOM_DETAIL_IDS = new Set(["art4-3"]);

export function ComplianceDashboard({
  initialData,
  initialRiskAssessmentRate,
}: {
  initialData: ComplianceData;
  initialRiskAssessmentRate: number;
}) {
  const [tasks, setTasks] = useState<Record<string, ChecklistTask[]>>(initialData.tasks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(initialData.updatedAt);
  const [riskAssessmentRate, setRiskAssessmentRate] = useState(initialRiskAssessmentRate);

  const stats = useMemo(() => {
    const base = computeComplianceStats({ updatedAt, tasks });
    // 4-3은 범용 체크리스트가 아니라 위험성평가 전용 데이터에서 계산한 이행율로 덮어쓴다.
    return base.map((s) => (s.id === "art4-3" ? { ...s, ratePct: riskAssessmentRate } : s));
  }, [tasks, updatedAt, riskAssessmentRate]);
  const overallRate = useMemo(() => computeOverallRate(stats), [stats]);
  const applicableCount = stats.filter((s) => s.ratePct !== null).length;
  const doneCategoryCount = stats.filter((s) => s.ratePct !== null && s.ratePct >= 100).length;

  const selectedCategory = COMPLIANCE_CATEGORIES.find((c) => c.id === selectedId) ?? null;
  const selectedStat = stats.find((s) => s.id === selectedId) ?? null;

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "저장에 실패했습니다.");
      }
      const saved = await res.json();
      setTasks(saved.tasks);
      setUpdatedAt(saved.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-800">중처법 이행관리</h1>
        <p className="mt-1 text-sm text-zinc-500">
          중대재해처벌법 시행령(중대산업재해, 제4조·제5조)에 규정된 법정 이행항목의 진행률을 관리합니다.
          {updatedAt && ` 마지막 업데이트: ${new Date(updatedAt).toLocaleString("ko-KR")}`}
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-lg border border-zinc-200 bg-white p-6 sm:flex-row sm:justify-center sm:gap-8">
        <ComplianceDonut percent={overallRate} size={140} strokeWidth={14} label="종합 이행율" />
        <div className="text-center sm:text-left">
          <p className="text-sm text-zinc-500">
            적용 대상 {applicableCount}개 항목 중 <span className="font-semibold text-zinc-800">{doneCategoryCount}개</span> 항목 100% 이행
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            (전담조직 설치 등 해당없음 항목은 집계에서 제외됩니다)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {COMPLIANCE_CATEGORIES.map((cat) => {
          const stat = stats.find((s) => s.id === cat.id)!;
          const isSelected = selectedId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedId(isSelected ? null : cat.id)}
              className={`flex flex-col items-center gap-2 rounded-lg border bg-white p-3 text-center transition ${
                isSelected ? "border-orange-500 ring-1 ring-orange-500" : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <ComplianceDonut percent={stat.ratePct} size={72} strokeWidth={8} />
              <span className="text-xs font-medium text-zinc-700">{cat.title}</span>
              <span className="text-[10px] text-zinc-400">{cat.article}</span>
              {stat.overdue && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                  점검기한 초과
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedCategory && selectedStat && CUSTOM_DETAIL_IDS.has(selectedCategory.id) && selectedCategory.id === "art4-3" && (
        <RiskAssessmentPanel onRateChange={setRiskAssessmentRate} />
      )}

      {selectedCategory && selectedStat && !CUSTOM_DETAIL_IDS.has(selectedCategory.id) && (
        <CategoryDetail
          category={selectedCategory}
          tasks={tasks[selectedCategory.id] ?? []}
          onChange={(next) => setTasks((prev) => ({ ...prev, [selectedCategory.id]: next }))}
          onSave={saveAll}
          saving={saving}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
