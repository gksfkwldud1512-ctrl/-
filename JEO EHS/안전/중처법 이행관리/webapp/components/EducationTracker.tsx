"use client";

import { useMemo, useRef, useState } from "react";
import {
  CYCLE_OPTIONS,
  computeDDay,
  computeDueDate,
  computeStatus,
  sortByUrgency,
  type EducationCycleMonths,
  type EducationData,
  type EducationItem,
  type EducationStatus,
} from "@/lib/education";

function formatDate(d: string | Date | null): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR");
}

function formatDDay(days: number | null): string {
  if (days === null) return "-";
  if (days === 0) return "D-DAY";
  if (days > 0) return `D-${days}`;
  return `D+${Math.abs(days)}`;
}

const STATUS_STYLE: Record<EducationStatus, { row: string; badge: string; label: string }> = {
  red: { row: "bg-red-50", badge: "bg-red-100 text-red-700", label: "기한 초과" },
  yellow: { row: "bg-yellow-50", badge: "bg-yellow-100 text-yellow-700", label: "올해 실시 필요" },
  green: { row: "bg-green-50", badge: "bg-green-100 text-green-700", label: "완료(여유)" },
  none: { row: "bg-white", badge: "bg-zinc-100 text-zinc-500", label: "미실시" },
};

const emptyForm = {
  name: "",
  target: "",
  cycleMonths: 12 as EducationCycleMonths,
  lastDate: "",
  qualification: "",
};

export function EducationTracker({ initialData }: { initialData: EducationData }) {
  const [items, setItems] = useState<EducationItem[]>(initialData.items);
  const [updatedAt, setUpdatedAt] = useState(initialData.updatedAt);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => sortByUrgency(items), [items]);
  const summary = useMemo(() => {
    const counts = { red: 0, yellow: 0, green: 0, none: 0 };
    for (const item of items) counts[computeStatus(item)]++;
    return counts;
  }, [items]);

  async function persist(next: EducationItem[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/education", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "저장에 실패했습니다.");
      }
      const saved = await res.json();
      setItems(saved.items);
      setUpdatedAt(saved.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function submitForm() {
    if (!form.name.trim()) {
      setError("법정교육명을 입력해 주세요.");
      return;
    }
    const patch = {
      name: form.name.trim(),
      target: form.target.trim(),
      cycleMonths: form.cycleMonths,
      lastDate: form.lastDate || null,
      qualification: form.qualification.trim(),
    };
    const next = editingId
      ? items.map((it) => (it.id === editingId ? { ...it, ...patch } : it))
      : [...items, { id: crypto.randomUUID(), ...patch }];
    setItems(next);
    setForm(emptyForm);
    setEditingId(null);
    void persist(next);
  }

  function removeItem(id: string) {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyForm);
    }
    void persist(next);
  }

  // 최근 교육일 수정 등 — 수강 완료 시 이 항목을 상단 입력폼에 불러와 이어서 편집한다.
  function startEdit(item: EducationItem) {
    setError(null);
    setEditingId(item.id);
    setForm({
      name: item.name,
      target: item.target,
      cycleMonths: item.cycleMonths,
      lastDate: item.lastDate ?? "",
      qualification: item.qualification,
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-800">법정교육 관리</h2>
        <p className="mt-1 text-sm text-zinc-500">
          교육별 법정 주기와 최근 교육일을 등록하면 교육기한일·D-DAY가 자동 계산되어 아래 표에서 색으로 표시됩니다.
          {updatedAt && ` 마지막 업데이트: ${new Date(updatedAt).toLocaleString("ko-KR")}`}
        </p>
      </div>

      {/* 상단: 입력 폼 */}
      <div ref={formRef} className={`rounded-lg border bg-white p-4 ${editingId ? "border-orange-400 ring-1 ring-orange-400" : "border-zinc-200"}`}>
        <p className="mb-3 text-sm font-medium text-zinc-700">
          {editingId ? "법정교육 수정 — 수강 완료 시 최근교육일을 갱신하세요" : "새 법정교육 등록"}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            법정교육명
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="예: 관리감독자 안전보건교육"
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            대상자
            <input
              type="text"
              value={form.target}
              onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
              placeholder="예: 생산1팀 관리감독자"
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            법정교육주기
            <select
              value={form.cycleMonths}
              onChange={(e) => setForm((f) => ({ ...f, cycleMonths: Number(e.target.value) as EducationCycleMonths }))}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800"
            >
              {CYCLE_OPTIONS.map((c) => (
                <option key={c.months} value={c.months}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            최근교육일
            <input
              type="date"
              value={form.lastDate}
              onChange={(e) => setForm((f) => ({ ...f, lastDate: e.target.value }))}
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            자격요건
            <input
              type="text"
              value={form.qualification}
              onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))}
              placeholder="예: 해당 없음 / 관리감독자 지정자"
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-800"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={submitForm}
            disabled={saving}
            className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "저장 중..." : editingId ? "수정 저장" : "+ 추가"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600">
              취소
            </button>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-red-400" /> 기한 초과 {summary.red}건
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-yellow-400" /> 올해 실시 필요 {summary.yellow}건
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-green-400" /> 완료(여유) {summary.green}건
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-zinc-300" /> 미실시(이력 없음) {summary.none}건
        </span>
      </div>

      {/* 하단: 추적관리 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
              <th className="px-3 py-2 font-medium">법정교육명</th>
              <th className="px-3 py-2 font-medium">대상자</th>
              <th className="px-3 py-2 font-medium">법정교육주기</th>
              <th className="px-3 py-2 font-medium">최근교육일</th>
              <th className="px-3 py-2 font-medium">자격요건</th>
              <th className="px-3 py-2 font-medium">교육기한일</th>
              <th className="px-3 py-2 font-medium">D-DAY</th>
              <th className="px-3 py-2 font-medium">상태</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-zinc-400">
                  등록된 법정교육이 없습니다. 위에서 추가해 주세요.
                </td>
              </tr>
            )}
            {sorted.map((item) => {
              const status = computeStatus(item);
              const style = STATUS_STYLE[status];
              const due = computeDueDate(item);
              const dday = computeDDay(item);
              const cycleLabel = CYCLE_OPTIONS.find((c) => c.months === item.cycleMonths)?.label ?? `${item.cycleMonths}개월`;
              const isEditing = editingId === item.id;
              return (
                <tr
                  key={item.id}
                  onDoubleClick={() => startEdit(item)}
                  title="더블클릭하면 상단 폼에서 수정할 수 있습니다"
                  className={`cursor-pointer border-b border-zinc-100 last:border-0 ${isEditing ? "bg-orange-50" : style.row}`}
                >
                  <td className="px-3 py-2 font-medium text-zinc-800">{item.name}</td>
                  <td className="px-3 py-2 text-zinc-600">{item.target || "-"}</td>
                  <td className="px-3 py-2 text-zinc-600">{cycleLabel}</td>
                  <td className="px-3 py-2 text-zinc-600">{formatDate(item.lastDate)}</td>
                  <td className="px-3 py-2 text-zinc-600">{item.qualification || "-"}</td>
                  <td className="px-3 py-2 text-zinc-600">{formatDate(due)}</td>
                  <td className="px-3 py-2 font-medium text-zinc-700">{formatDDay(dday)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.badge}`}>{style.label}</span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(item);
                      }}
                      className="text-xs text-orange-600 hover:underline"
                    >
                      수정
                    </button>
                    <span className="mx-1.5 text-zinc-300">|</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.id);
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
