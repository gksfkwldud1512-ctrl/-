"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function KpiUploadForm({ lastUpdated, sourceFilename }: { lastUpdated: string | null; sourceFilename: string | null }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("엑셀 파일을 선택해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/kpi/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "업로드에 실패했습니다.");
      }
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="file">
          DETAILS 내보내기 파일 (.xlsx, SPHERA/E MASTER 형식)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1"
        />
        <p className="text-xs text-zinc-400">
          업로드하면 이전 데이터를 전부 대체합니다 (항상 최신 파일 기준으로만 표시).
          {lastUpdated && ` 마지막 업로드: ${new Date(lastUpdated).toLocaleString("ko-KR")}${sourceFilename ? ` (${sourceFilename})` : ""}`}
        </p>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="h-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "분석 중..." : "업로드"}
      </button>
      {error && <p className="text-sm text-red-600 sm:basis-full">{error}</p>}
    </form>
  );
}
