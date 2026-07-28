"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HazardGrade } from "@/lib/db/schema";

const GRADE_OPTIONS = ["A", "B", "C1", "C2", "CN", "R", "D1", "D2"];

type HazardRow = HazardGrade & { key: string };

function newKey() {
  return Math.random().toString(36).slice(2);
}

export function PlacementExamReviewForm({
  examId,
  initial,
}: {
  examId: string;
  initial: {
    name: string;
    age: number | null;
    gender: string | null;
    residentNumberMasked: string | null;
    department: string | null;
    workProcess: string | null;
    examDate: string | null;
    nextExamDate: string | null;
    hazardGrades: HazardGrade[];
    healthGradeWorst: string | null;
    opinionText: string | null;
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [age, setAge] = useState(initial.age?.toString() ?? "");
  const [gender, setGender] = useState(initial.gender ?? "");
  const [residentNumberMasked, setResidentNumberMasked] = useState(initial.residentNumberMasked ?? "");
  const [department, setDepartment] = useState(initial.department ?? "");
  const [workProcess, setWorkProcess] = useState(initial.workProcess ?? "");
  const [examDate, setExamDate] = useState(initial.examDate ?? "");
  const [nextExamDate, setNextExamDate] = useState(initial.nextExamDate ?? "");
  const [healthGradeWorst, setHealthGradeWorst] = useState(initial.healthGradeWorst ?? "");
  const [opinionText, setOpinionText] = useState(initial.opinionText ?? "");
  const [rows, setRows] = useState<HazardRow[]>(
    initial.hazardGrades.map((h) => ({ ...h, key: newKey() }))
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateRow(key: string, field: "hazard" | "grade", value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { key: newKey(), hazard: "", grade: "A" }]);
  }
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function buildPayload() {
    return {
      name: name.trim(),
      age: age.trim() === "" ? null : Number(age),
      gender: gender.trim() || null,
      residentNumberMasked: residentNumberMasked.trim() || null,
      department: department.trim() || null,
      workProcess: workProcess.trim() || null,
      examDate: examDate.trim() || null,
      nextExamDate: nextExamDate.trim() || null,
      hazardGrades: rows
        .filter((r) => r.hazard.trim() !== "")
        .map((r) => ({ hazard: r.hazard.trim(), grade: r.grade })),
      healthGradeWorst: healthGradeWorst.trim() || null,
      opinionText: opinionText.trim() || null,
    };
  }

  async function saveDraft(): Promise<boolean> {
    setError(null);
    const res = await fetch(`/api/placement-exam/${examId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    if (!res.ok) {
      setError("저장에 실패했습니다.");
      return false;
    }
    return true;
  }

  async function handleSaveDraft() {
    setSaving(true);
    const ok = await saveDraft();
    setSaving(false);
    if (ok) {
      setMessage("저장되었습니다.");
      setTimeout(() => setMessage(null), 2000);
    }
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    const ok = await saveDraft();
    if (!ok) {
      setSaving(false);
      return;
    }
    const res = await fetch(`/api/placement-exam/${examId}/confirm`, { method: "POST" });
    if (!res.ok) {
      setError("확정에 실패했습니다.");
      setSaving(false);
      return;
    }
    router.push(`/placement-exam/${examId}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        PDF에서 자동으로 추출한 초안입니다. 표 형식이 복잡해 일부 항목이 비거나 틀릴 수 있으니
        확인하고 필요하면 직접 수정한 뒤 저장해 주세요. 주민번호는 뒷자리 마스킹 형태로만 저장됩니다.
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="성함">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="나이">
          <input value={age} onChange={(e) => setAge(e.target.value)} className={inputCls} />
        </Field>
        <Field label="성별">
          <input value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls} />
        </Field>
        <Field label="주민등록번호(마스킹)">
          <input
            value={residentNumberMasked}
            onChange={(e) => setResidentNumberMasked(e.target.value)}
            placeholder="예: 900101-1******"
            className={`${inputCls} font-mono`}
          />
        </Field>
        <Field label="부서">
          <input value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls} />
        </Field>
        <Field label="작업공정">
          <input value={workProcess} onChange={(e) => setWorkProcess(e.target.value)} className={inputCls} />
        </Field>
        <Field label="배치전검진일">
          <input
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            placeholder="YYYY-MM-DD"
            className={inputCls}
          />
        </Field>
        <Field label="배치후 검진만료(차기 예정일)">
          <input
            value={nextExamDate}
            onChange={(e) => setNextExamDate(e.target.value)}
            placeholder="YYYY-MM-DD"
            className={inputCls}
          />
        </Field>
        <Field label="건강구분(대표)">
          <select
            value={healthGradeWorst}
            onChange={(e) => setHealthGradeWorst(e.target.value)}
            className={inputCls}
          >
            <option value="">선택 안함</option>
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700">유해인자별 건강구분</p>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">유해인자 / 검진구분</th>
                <th className="px-3 py-2 font-medium">등급</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-3 py-2">
                    <input
                      value={row.hazard}
                      onChange={(e) => updateRow(row.key, "hazard", e.target.value)}
                      className="w-full rounded border border-zinc-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.grade}
                      onChange={(e) => updateRow(row.key, "grade", e.target.value)}
                      className="rounded border border-zinc-200 px-2 py-1"
                    >
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="text-zinc-400 hover:text-red-600"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          + 유해인자 행 추가
        </button>
      </div>

      <Field label="검진소견 / 사후관리조치">
        <textarea
          value={opinionText}
          onChange={(e) => setOpinionText(e.target.value)}
          rows={10}
          className={`${inputCls} font-mono`}
        />
      </Field>

      <div className="flex items-center gap-3">
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
        >
          저장
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          확인 및 저장
        </button>
      </div>
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}
