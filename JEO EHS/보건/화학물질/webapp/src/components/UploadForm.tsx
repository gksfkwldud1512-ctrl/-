"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

async function uploadOne(file: File, materialType: string): Promise<{ ok: boolean; error?: string }> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("materialType", materialType);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? "업로드 실패" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "네트워크 오류" };
  }
}

export function UploadForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFailedFiles([]);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const materialType = String(formData.get("materialType") ?? "raw");
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const files = fileInput.files ? Array.from(fileInput.files) : [];

    if (files.length === 0) {
      setError("PDF 파일을 선택해 주세요.");
      return;
    }

    setSubmitting(true);
    setProgress({ done: 0, total: files.length });

    const failed: string[] = [];
    let lastSingleMixtureId: string | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fd = new FormData();
      fd.set("file", file);
      fd.set("materialType", materialType);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const body = await res.json();
        lastSingleMixtureId = body.mixtureId;
      } else {
        failed.push(file.name);
      }
      setProgress({ done: i + 1, total: files.length });
    }

    setSubmitting(false);
    setFailedFiles(failed);

    if (files.length === 1 && failed.length === 0 && lastSingleMixtureId) {
      router.push(`/mixtures/${lastSingleMixtureId}/review`);
    } else {
      router.refresh();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-end"
    >
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="materialType">
          구분
        </label>
        <select
          id="materialType"
          name="materialType"
          defaultValue="raw"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="raw">원재료</option>
          <option value="auxiliary">부자재</option>
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="file">
          MSDS PDF 파일 (여러 개 선택 가능)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf"
          multiple
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="h-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting && progress
          ? `업로드 중... (${progress.done}/${progress.total})`
          : "MSDS 업로드"}
      </button>
      {error && <p className="text-sm text-red-600 sm:basis-full">{error}</p>}
      {failedFiles.length > 0 && (
        <p className="text-sm text-red-600 sm:basis-full">
          업로드 실패: {failedFiles.join(", ")}
        </p>
      )}
    </form>
  );
}
