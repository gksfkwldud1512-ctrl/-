"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { MaterialType } from "@/lib/db/schema";
import { COMMON_DEPARTMENT } from "@/lib/constants";

export function UploadForm({
  departments,
  positionsByDepartment,
}: {
  departments: string[];
  positionsByDepartment: Record<string, string[]>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const [materialType, setMaterialType] = useState<MaterialType>("raw");
  const [department, setDepartment] = useState("");
  const [workProcess, setWorkProcess] = useState("");

  const processOptions = useMemo(
    () => positionsByDepartment[department] ?? [],
    [department, positionsByDepartment]
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFailedFiles([]);
    const form = e.currentTarget;
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
      fd.set("department", materialType === "raw" ? "" : department);
      fd.set("workProcess", materialType === "raw" ? "" : workProcess);
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
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="materialType">
          구분
        </label>
        <select
          id="materialType"
          value={materialType}
          onChange={(e) => setMaterialType(e.target.value as MaterialType)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="raw">원재료 (부서: {COMMON_DEPARTMENT})</option>
          <option value="auxiliary">부자재</option>
        </select>
      </div>
      {materialType === "auxiliary" && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-zinc-700" htmlFor="department">
              부서
            </label>
            <select
              id="department"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setWorkProcess("");
              }}
              className="w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">선택</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-zinc-700" htmlFor="workProcess">
              공정(포지션)
            </label>
            <select
              id="workProcess"
              value={workProcess}
              onChange={(e) => setWorkProcess(e.target.value)}
              disabled={!department}
              className="w-40 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
            >
              <option value="">선택</option>
              {processOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
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
