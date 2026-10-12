"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Manifest } from "@/lib/water/manifests";

export type WastewaterSummary = {
  year: number;
  dayCount: number;
  pageCount: number;
  maxStorage: number;
  lastDate: string | null;
  warnings: string[];
};

export function WastewaterLogPanel({
  manifests,
  years,
  summary,
}: {
  manifests: Manifest[];
  years: number[];
  summary: WastewaterSummary;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [year, setYear] = useState(summary.year);

  async function handleUpload(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/water/manifests", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ kind: "error", text: json.error ?? "업로드에 실패했습니다." });
      } else {
        const skipped = (json.skipped as string[]).length;
        setMessage({
          kind: "ok",
          text: `인계 ${json.parsed}건 읽음 · 새로 추가 ${json.added}건 · 전체 ${json.total}건${skipped ? ` · 제외 ${skipped}건` : ""}`,
        });
        router.refresh();
      }
    } catch {
      setMessage({ kind: "error", text: "업로드 중 오류가 발생했습니다." });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(m: Manifest) {
    if (!window.confirm(`${m.date} ${m.amountM3}㎥ (${m.shortSerial}) 인계 내역을 삭제할까요?`)) return;
    const res = await fetch("/api/water/manifests", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serialNo: m.serialNo }),
    });
    if (res.ok) router.refresh();
    else setMessage({ kind: "error", text: "삭제에 실패했습니다." });
  }

  const yearManifests = manifests.filter((m) => m.date.startsWith(String(year)));
  const yearTotal = yearManifests.reduce((s, m) => s + m.amountM3, 0);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">폐수일지 (폐수배출시설 운영일지)</h2>
          <p className="mt-1 text-sm text-zinc-500">
            올바로 &lsquo;폐수위(수)탁 인계서 목록&rsquo;(.xls)을 올리면 1/1부터 마지막 인계일까지 용수사용량·폐수발생량·보관폐수량(최대
            36㎥)을 계산해 별지 제20호서식 일지로 만들어 줍니다. 인계서를 새로 올리면 같은 번호는 건너뛰고 새 건만 추가됩니다.
          </p>
        </div>
        <label className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
          {uploading ? "업로드 중…" : "위탁인계서 업로드"}
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
          />
        </label>
      </div>

      {message && (
        <p
          className={`mt-3 rounded-md px-3 py-2 text-sm ${
            message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={year}
          onChange={(e) => {
            const y = Number(e.target.value);
            setYear(y);
            router.push(`/water?year=${y}`);
          }}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          aria-label="연도"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <a
          href={`/api/water/wastewater-log?year=${year}`}
          className={`rounded-md border px-4 py-2 text-sm font-medium ${
            summary.dayCount > 0
              ? "border-zinc-900 text-zinc-900 hover:bg-zinc-100"
              : "pointer-events-none border-zinc-200 text-zinc-300"
          }`}
        >
          폐수일지 다운로드(.xlsx)
        </a>
        {summary.dayCount > 0 && (
          <span className="text-sm text-zinc-500">
            1/1 ~ {summary.lastDate} · {summary.dayCount}일 · {summary.pageCount}쪽 · 위탁 직전 최대 보관량{" "}
            <b className="text-zinc-800">{summary.maxStorage}㎥</b>
          </span>
        )}
      </div>

      {summary.warnings.length > 0 && (
        <ul className="mt-3 list-inside list-disc rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {summary.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">인계일</th>
              <th className="px-3 py-2 font-medium">처리업소</th>
              <th className="px-3 py-2 font-medium">위탁·수탁 확인서 번호</th>
              <th className="px-3 py-2 text-right font-medium">인계량(㎥)</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {yearManifests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                  {year}년 인계 내역이 없습니다. 위탁인계서를 업로드해 주세요.
                </td>
              </tr>
            )}
            {yearManifests.map((m) => (
              <tr key={m.serialNo}>
                <td className="whitespace-nowrap px-3 py-2">{m.date}</td>
                <td className="px-3 py-2">{m.company}</td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-600">{m.serialNo}</td>
                <td className="px-3 py-2 text-right">{m.amountM3}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => handleDelete(m)} className="text-xs text-zinc-400 hover:text-red-600">
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {yearManifests.length > 0 && (
            <tfoot className="bg-zinc-50 text-zinc-700">
              <tr>
                <td className="px-3 py-2 font-medium" colSpan={3}>
                  {year}년 합계 ({yearManifests.length}건)
                </td>
                <td className="px-3 py-2 text-right font-medium">{yearTotal}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
