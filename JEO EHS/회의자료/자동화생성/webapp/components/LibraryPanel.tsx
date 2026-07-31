"use client";

import { useState } from "react";
import type { LibraryEntry } from "@/lib/library";

export function LibraryPanel({ initialEntries }: { initialEntries: LibraryEntry[] }) {
  const [entries, setEntries] = useState<LibraryEntry[]>(initialEntries);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("label", label || file.name);
      const res = await fetch("/api/library/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "업로드에 실패했습니다.");
      }
      const entry: LibraryEntry = await res.json();
      setEntries((prev) => [entry, ...prev]);
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/library?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-800">완성본 라이브러리</h2>
        <p className="mt-1 text-xs text-zinc-500">
          실제로 완성해서 쓴 회의자료 PPT를 올려두면 날짜별로 목록화되고, 슬라이드에 있던 문구를 그대로
          추출해서 다음에 참고할 수 있습니다. (참고: 완전 자동으로 "어휘·양식을 학습"하려면 서버에
          AI 모델이 연결돼 있어야 하는데 지금은 그게 없어서, 대신 이렇게 텍스트를 뽑아 목록으로
          보여드리는 방식입니다 — 이 도구로 직접 번역한 문구는 별도로 계속 기억됩니다.)
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-zinc-300 p-3">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="설명(예: 2026-08-03 주간회의)"
          className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm"
        />
        <label className="cursor-pointer rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white">
          {uploading ? "업로드 중..." : "PPT 업로드"}
          <input
            type="file"
            accept=".pptx"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {entries.length === 0 && <p className="text-sm text-zinc-400">아직 업로드된 완성본이 없습니다.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-md border border-zinc-200 p-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-zinc-800">{entry.label}</p>
                <p className="text-xs text-zinc-400">
                  {new Date(entry.uploadedAt).toLocaleString("ko-KR")} · {entry.fileName} · 슬라이드 {entry.slideTexts.length}장
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button type="button" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)} className="text-orange-600 hover:underline">
                  {expandedId === entry.id ? "닫기" : "문구 보기"}
                </button>
                <a href={`/api/library/file?path=${encodeURIComponent(entry.blobPath)}`} className="text-zinc-600 hover:underline">
                  다운로드
                </a>
                <button type="button" onClick={() => handleDelete(entry.id)} className="text-red-500 hover:underline">
                  삭제
                </button>
              </div>
            </div>
            {expandedId === entry.id && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded bg-zinc-50 p-2 text-xs text-zinc-700">
                {entry.slideTexts.map((lines, i) => (
                  <div key={i} className="mb-2">
                    <p className="font-semibold text-zinc-500">슬라이드 {i + 1}</p>
                    {lines.map((line, j) => (
                      <p key={j}>{line}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
