"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/** 사원명부 xlsx를 업로드해 employees 테이블을 통째로 교체한다(신규입사자/인원변경 반영). */
export function EmployeeRosterUploadForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setError("xlsx 파일을 선택해 주세요.");
      return;
    }

    setSubmitting(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/employees/upload", { method: "POST", body: fd });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "업로드에 실패했습니다.");
      return;
    }
    const body = await res.json();
    setMessage(`업로드 완료 — 총 ${body.totalRows}행 중 ${body.inserted}명 반영 (제외 ${body.skipped}행)`);
    form.reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="roster-file">
          사원명부 xlsx (사원명 | 사번 | 부서명 | 포지션 | 입사일)
        </label>
        <input
          id="roster-file"
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="h-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "업로드 중..." : "명부 업로드(전체 교체)"}
      </button>
      {message && <p className="text-sm text-emerald-600 sm:basis-full">{message}</p>}
      {error && <p className="text-sm text-red-600 sm:basis-full">{error}</p>}
    </form>
  );
}
