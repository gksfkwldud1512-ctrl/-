"use client";

import { useState } from "react";
import type { ChecklistTask } from "@/lib/complianceData";
import type { ComplianceCategory } from "@/lib/complianceItems";

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("ko-KR");
}

// 항목 상세 화면의 범용 기본형 — 체크리스트(세부 이행점검 항목) + 증빙파일 첨부.
// 1차 구현은 모든 적용 항목에 이 화면을 그대로 쓴다. 항목별 커스터마이징(예: 4-1 업로드+미리보기형,
// 4-3 위험성평가 반기실적/목록/공정별 집계형)은 사용자가 항목별로 추가 지시하면 이 컴포넌트 대신
// 해당 항목 전용 컴포넌트로 교체할 예정 — 지금은 설계만 남겨두고 구현하지 않는다.
export function CategoryDetail({
  category,
  tasks,
  onChange,
  onSave,
  saving,
}: {
  category: ComplianceCategory;
  tasks: ChecklistTask[];
  onChange: (next: ChecklistTask[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [newText, setNewText] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addTask() {
    if (!newText.trim()) return;
    const task: ChecklistTask = {
      id: crypto.randomUUID(),
      text: newText.trim(),
      done: false,
      completedAt: null,
      lastCheckedAt: null,
      note: "",
      evidenceFiles: [],
    };
    onChange([...tasks, task]);
    setNewText("");
  }

  function removeTask(id: string) {
    onChange(tasks.filter((t) => t.id !== id));
  }

  function updateTask(id: string, patch: Partial<ChecklistTask>) {
    onChange(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function toggleDone(task: ChecklistTask) {
    if (!task.done && task.evidenceFiles.length === 0) {
      setError("증빙 파일을 먼저 첨부해야 완료로 체크할 수 있습니다.");
      return;
    }
    setError(null);
    updateTask(task.id, { done: !task.done, completedAt: !task.done ? new Date().toISOString() : null });
  }

  async function handleUpload(task: ChecklistTask, file: File) {
    setError(null);
    setUploadingId(task.id);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("categoryId", category.id);
      const res = await fetch("/api/compliance/evidence", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "파일 업로드에 실패했습니다.");
      }
      const evidence = await res.json();
      updateTask(task.id, { evidenceFiles: [...task.evidenceFiles, evidence] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingId(null);
    }
  }

  function removeEvidence(task: ChecklistTask, url: string) {
    const nextFiles = task.evidenceFiles.filter((f) => f.url !== url);
    // 증빙이 전부 없어지면 완료 상태도 함께 해제한다(엄격 모드 일관성 유지).
    updateTask(task.id, { evidenceFiles: nextFiles, ...(nextFiles.length === 0 ? { done: false, completedAt: null } : {}) });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div>
        <p className="text-xs font-medium text-orange-600">{category.article}</p>
        <h3 className="text-base font-semibold text-zinc-800">{category.title}</h3>
        <p className="mt-1 text-sm text-zinc-600">{category.summary}</p>
        {category.checkCycle && (
          <p className="mt-1 text-xs text-zinc-500">점검 주기: {category.checkCycle}</p>
        )}
      </div>

      <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-3">
        <p className="text-xs font-medium text-zinc-600">필요 증빙자료 예시</p>
        <p className="mt-1 text-xs text-zinc-500">{category.evidenceExamples.join(" · ")}</p>
      </div>

      <div className="flex flex-col gap-3">
        {tasks.length === 0 && (
          <p className="rounded-md border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-400">
            아직 등록된 세부 이행점검 항목이 없습니다. 아래에서 추가하세요.
          </p>
        )}
        {tasks.map((task) => (
          <div key={task.id} className="rounded-md border border-zinc-200 p-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => toggleDone(task)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <div className="flex-1">
                <p className={`text-sm font-medium ${task.done ? "text-zinc-500 line-through" : "text-zinc-800"}`}>
                  {task.text}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                  <span>완료일: {formatDate(task.completedAt)}</span>
                  {category.checkCycle && (
                    <label className="flex items-center gap-1">
                      최근 점검일:
                      <input
                        type="date"
                        value={task.lastCheckedAt ? task.lastCheckedAt.slice(0, 10) : ""}
                        onChange={(e) => updateTask(task.id, { lastCheckedAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                        className="rounded border border-zinc-200 px-1 py-0.5 text-xs"
                      />
                    </label>
                  )}
                  <button type="button" onClick={() => removeTask(task.id)} className="text-red-500 hover:underline">
                    삭제
                  </button>
                </div>
                <input
                  type="text"
                  value={task.note}
                  onChange={(e) => updateTask(task.id, { note: e.target.value })}
                  placeholder="비고"
                  className="mt-2 w-full rounded border border-zinc-200 px-2 py-1 text-xs"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {task.evidenceFiles.map((f) => (
                    <span key={f.url} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                      <a href={`/api/compliance/evidence?path=${encodeURIComponent(f.url)}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        📎 {f.name}
                      </a>
                      <button type="button" onClick={() => removeEvidence(task, f.url)} className="text-red-500">
                        ×
                      </button>
                    </span>
                  ))}
                  <label className="cursor-pointer rounded-full border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
                    {uploadingId === task.id ? "업로드 중..." : "+ 증빙 파일"}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadingId === task.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(task, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="세부 이행점검 항목 추가 (예: 안전보건 인력 예산 편성)"
          className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <button type="button" onClick={addTask} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
          추가
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-fit rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
