"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeProcessSummary,
  computeRiskAssessmentRate,
  computeSemiAnnualSummary,
  halfOfDate,
  type RiskAssessmentData,
  type RiskAssessmentRecord,
  type SemiAnnualTarget,
} from "@/lib/riskAssessment";

const CATEGORY_ID = "art4-3";
const EMPTY_DRAFT: Omit<RiskAssessmentRecord, "id" | "evidenceFiles"> = {
  date: new Date().toISOString().slice(0, 10),
  process: "",
  assessor: "",
  hazard: "",
  riskLevel: "중",
  improvement: "",
  status: "계획",
};

// 4-3(유해·위험요인 확인 및 개선 절차 — 위험성평가) 전용 상세화면. 범용 체크리스트(CategoryDetail)
// 대신 이 컴포넌트를 쓴다: 반기별 목표/실적, 공정별 종합 현황, 실시 목록을 실무에 맞게 보여준다.
export function RiskAssessmentPanel({ onRateChange }: { onRateChange: (rate: number) => void }) {
  const [data, setData] = useState<RiskAssessmentData | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/compliance/risk-assessment")
      .then((r) => r.json())
      .then((d: RiskAssessmentData) => setData(d));
  }, []);

  const semiAnnual = useMemo(() => (data ? computeSemiAnnualSummary(data) : []), [data]);
  const processSummary = useMemo(() => (data ? computeProcessSummary(data) : []), [data]);

  useEffect(() => {
    if (data) onRateChange(computeRiskAssessmentRate(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function persist(records: RiskAssessmentRecord[], targets: SemiAnnualTarget[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/compliance/risk-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, targets }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "저장에 실패했습니다.");
      }
      const saved: RiskAssessmentData = await res.json();
      setData(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function addRecord() {
    if (!data) return;
    if (!draft.process.trim() || !draft.hazard.trim()) {
      setError("공정명과 위험요인은 필수입니다.");
      return;
    }
    const record: RiskAssessmentRecord = { id: crypto.randomUUID(), ...draft, evidenceFiles: [] };
    const nextRecords = [...data.records, record];
    let nextTargets = data.targets;
    const { year, half } = halfOfDate(draft.date);
    const targetId = `${year}-${half}`;
    if (!data.targets.some((t) => t.id === targetId)) {
      nextTargets = [...data.targets, { id: targetId, year, half, targetCount: 0, note: "" }];
    }
    setDraft({ ...EMPTY_DRAFT, date: draft.date });
    persist(nextRecords, nextTargets);
  }

  function removeRecord(id: string) {
    if (!data) return;
    persist(data.records.filter((r) => r.id !== id), data.targets);
  }

  function updateTargetCount(id: string, targetCount: number) {
    if (!data) return;
    const exists = data.targets.some((t) => t.id === id);
    const nextTargets = exists
      ? data.targets.map((t) => (t.id === id ? { ...t, targetCount } : t))
      : [...data.targets, { id, year: id.split("-")[0], half: id.split("-")[1] as "상반기" | "하반기", targetCount, note: "" }];
    persist(data.records, nextTargets);
  }

  async function uploadEvidence(record: RiskAssessmentRecord, file: File) {
    if (!data) return;
    setUploadingId(record.id);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("categoryId", CATEGORY_ID);
      const res = await fetch("/api/compliance/evidence", { method: "POST", body: formData });
      if (!res.ok) throw new Error("업로드에 실패했습니다.");
      const evidence = await res.json();
      const nextRecords = data.records.map((r) => (r.id === record.id ? { ...r, evidenceFiles: [...r.evidenceFiles, evidence] } : r));
      persist(nextRecords, data.targets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingId(null);
    }
  }

  if (!data) {
    return <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-400">불러오는 중...</div>;
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div>
        <p className="text-xs font-medium text-orange-600">시행령 제4조 3호</p>
        <h3 className="text-base font-semibold text-zinc-800">유해·위험요인 확인 및 개선 (위험성평가)</h3>
        <p className="mt-1 text-sm text-zinc-600">
          사업장 특성에 따른 유해·위험요인을 확인해 개선하는 업무절차를 마련하고, 반기 1회 이상 점검할 것.
        </p>
      </div>

      {/* 반기별 목표/실적 */}
      <div>
        <p className="mb-1 text-xs font-medium text-zinc-500">반기별 목표·실적</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-2 py-1.5 text-left">연도</th>
                <th className="px-2 py-1.5 text-left">반기</th>
                <th className="px-2 py-1.5 text-center bg-amber-50">목표 건수(입력)</th>
                <th className="px-2 py-1.5 text-center">실적 건수</th>
                <th className="px-2 py-1.5 text-center">달성률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {semiAnnual.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-zinc-400">
                    아래에서 위험성평가를 등록하면 반기가 자동으로 추가됩니다.
                  </td>
                </tr>
              )}
              {semiAnnual.map((s) => (
                <tr key={s.id}>
                  <td className="px-2 py-1.5">{s.year}</td>
                  <td className="px-2 py-1.5">{s.half}</td>
                  <td className="px-2 py-1.5 text-center bg-amber-50">
                    <input
                      type="number"
                      defaultValue={s.targetCount || ""}
                      onBlur={(e) => updateTargetCount(s.id, Number(e.target.value) || 0)}
                      className="w-16 rounded border border-zinc-300 px-1 py-0.5 text-center"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">{s.actualCount}</td>
                  <td className="px-2 py-1.5 text-center">{s.achievedPct !== null ? `${Math.min(100, s.achievedPct)}%` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 공정별 종합 현황 */}
      <div>
        <p className="mb-1 text-xs font-medium text-zinc-500">공정별 종합 현황</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-2 py-1.5 text-left">공정</th>
                <th className="px-2 py-1.5 text-center">실시 건수</th>
                <th className="px-2 py-1.5 text-center">완료 건수</th>
                <th className="px-2 py-1.5 text-center">최근 실시일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {processSummary.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-zinc-400">등록된 위험성평가가 없습니다.</td>
                </tr>
              )}
              {processSummary.map((p) => (
                <tr key={p.process}>
                  <td className="px-2 py-1.5 font-medium text-zinc-700">{p.process}</td>
                  <td className="px-2 py-1.5 text-center">{p.count}</td>
                  <td className="px-2 py-1.5 text-center">{p.completedCount}</td>
                  <td className="px-2 py-1.5 text-center">{p.latestDate ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 위험성평가 실시 목록 */}
      <div>
        <p className="mb-1 text-xs font-medium text-zinc-500">위험성평가 실시 목록 (총 {data.records.length}건)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-2 py-1.5 text-left">일자</th>
                <th className="px-2 py-1.5 text-left">공정</th>
                <th className="px-2 py-1.5 text-left">평가자</th>
                <th className="px-2 py-1.5 text-left">위험요인</th>
                <th className="px-2 py-1.5 text-center">위험성</th>
                <th className="px-2 py-1.5 text-left">개선조치</th>
                <th className="px-2 py-1.5 text-center">상태</th>
                <th className="px-2 py-1.5 text-center">증빙</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.records.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.date}</td>
                  <td className="px-2 py-1.5">{r.process}</td>
                  <td className="px-2 py-1.5">{r.assessor}</td>
                  <td className="px-2 py-1.5">{r.hazard}</td>
                  <td className="px-2 py-1.5 text-center">{r.riskLevel}</td>
                  <td className="px-2 py-1.5">{r.improvement}</td>
                  <td className="px-2 py-1.5 text-center">{r.status}</td>
                  <td className="px-2 py-1.5 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {r.evidenceFiles.map((f) => (
                        <a
                          key={f.url}
                          href={`/api/compliance/evidence?path=${encodeURIComponent(f.url)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-600 hover:underline"
                        >
                          📎
                        </a>
                      ))}
                      <label className="cursor-pointer text-zinc-400 hover:text-zinc-600">
                        {uploadingId === r.id ? "..." : "+"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingId === r.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadEvidence(r, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => removeRecord(r.id)} className="text-red-500 hover:underline">
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 새 위험성평가 추가 */}
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-dashed border-zinc-300 p-3 sm:grid-cols-4">
          <input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className="rounded border border-zinc-300 px-2 py-1 text-xs" />
          <input type="text" placeholder="공정" value={draft.process} onChange={(e) => setDraft((d) => ({ ...d, process: e.target.value }))} className="rounded border border-zinc-300 px-2 py-1 text-xs" />
          <input type="text" placeholder="평가자" value={draft.assessor} onChange={(e) => setDraft((d) => ({ ...d, assessor: e.target.value }))} className="rounded border border-zinc-300 px-2 py-1 text-xs" />
          <select value={draft.riskLevel} onChange={(e) => setDraft((d) => ({ ...d, riskLevel: e.target.value as RiskAssessmentRecord["riskLevel"] }))} className="rounded border border-zinc-300 px-2 py-1 text-xs">
            <option value="상">위험성: 상</option>
            <option value="중">위험성: 중</option>
            <option value="하">위험성: 하</option>
          </select>
          <input type="text" placeholder="위험요인" value={draft.hazard} onChange={(e) => setDraft((d) => ({ ...d, hazard: e.target.value }))} className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-xs" />
          <input type="text" placeholder="개선조치" value={draft.improvement} onChange={(e) => setDraft((d) => ({ ...d, improvement: e.target.value }))} className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-xs sm:col-span-1" />
          <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as RiskAssessmentRecord["status"] }))} className="rounded border border-zinc-300 px-2 py-1 text-xs">
            <option value="계획">계획</option>
            <option value="진행중">진행중</option>
            <option value="완료">완료</option>
          </select>
          <button type="button" onClick={addRecord} disabled={saving} className="col-span-2 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 sm:col-span-4">
            {saving ? "저장 중..." : "위험성평가 추가"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
