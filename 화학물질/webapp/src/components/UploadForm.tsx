"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function UploadForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    if (!(formData.get("file") instanceof File) || (formData.get("file") as File).size === 0) {
      setError("PDF 파일을 선택해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "업로드에 실패했습니다.");
      }
      const { mixtureId } = await res.json();
      router.push(`/mixtures/${mixtureId}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="productName">
          제품명 (선택)
        </label>
        <input
          id="productName"
          name="productName"
          type="text"
          placeholder="비워두면 파일명을 사용합니다"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="file">
          MSDS PDF 파일
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="h-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "업로드 중..." : "MSDS 업로드"}
      </button>
      {error && <p className="text-sm text-red-600 sm:basis-full">{error}</p>}
    </form>
  );
}
