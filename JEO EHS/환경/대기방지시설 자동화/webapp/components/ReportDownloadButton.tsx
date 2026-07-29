"use client";

import { useState } from "react";

export function ReportDownloadButton({ fiscalYears }: { fiscalYears: string[] }) {
  const [fy, setFy] = useState(fiscalYears[fiscalYears.length - 1] ?? "");

  if (fiscalYears.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <select
        value={fy}
        onChange={(e) => setFy(e.target.value)}
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
      >
        {fiscalYears.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <a
        href={`/api/kpi/report?fy=${encodeURIComponent(fy)}`}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
      >
        보고서 다운로드 (PPT)
      </a>
    </div>
  );
}
