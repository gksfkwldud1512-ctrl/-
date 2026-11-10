"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ChangeEvent } from "react";
import { buildEnvPayload, parseEnvWorkbook, ENV_MONTHS, type EnvParsed } from "@/lib/kpi/parseEnvSheet";

const KO_MONTH: Record<string, string> = {
  Apr: "4월", May: "5월", Jun: "6월", Jul: "7월", Aug: "8월", Sep: "9월",
  Oct: "10월", Nov: "11월", Dec: "12월", Jan: "1월", Feb: "2월", Mar: "3월",
};

/**
 * 환경종합자료(내가 관리하는 엑셀)의 FY26 시트로 본사 DETAILS 도착 전에 먼저 반영한다.
 * 파일이 크므로(숨김 시트 다수) 브라우저에서 FY26 시트만 읽어 숫자만 서버로 보낸다.
 */
export function EnvSheetUploadForm() {
  const router = useRouter();
  const [filename, setFilename] = useState("");
  const [blocks, setBlocks] = useState<EnvParsed[] | null>(null);
  const [fyIndex, setFyIndex] = useState(0);
  const [lastIndex, setLastIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const block = blocks?.[fyIndex] ?? null;

  const preview = useMemo(() => {
    if (!block || lastIndex < 0) return null;
    try {
      return { ...buildEnvPayload(block, lastIndex, filename), error: null as string | null };
    } catch (e) {
      return { payload: null, warnings: [] as string[], error: e instanceof Error ? e.message : String(e) };
    }
  }, [block, lastIndex, filename]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    setDone(null);
    setBlocks(null);
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseEnvWorkbook(await file.arrayBuffer());
      // 데이터가 있는 가장 최근 회계연도를 기본 선택한다.
      let idx = parsed.length - 1;
      while (idx > 0 && parsed[idx].suggestedLastIndex < 0) idx--;
      setFilename(file.name);
      setBlocks(parsed);
      setFyIndex(idx);
      setLastIndex(parsed[idx].suggestedLastIndex);
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일을 읽지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function onApply() {
    if (!preview?.payload) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/kpi/env-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview.payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "반영에 실패했습니다.");
      }
      setDone(`${preview.payload.fiscalYear} ${KO_MONTH[preview.payload.lastMonth]}까지 반영했습니다.`);
      setBlocks(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "반영 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-zinc-700" htmlFor="env-file">
          환경종합자료 (.xlsx, FY26 시트) — 본사 DETAILS가 늦을 때 먼저 반영
        </label>
        <input
          id="env-file"
          type="file"
          accept=".xlsx"
          onChange={onFile}
          disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1"
        />
        <p className="text-xs text-zinc-400">
          선택한 회계연도의 값만 교체하고 이전 연도 데이터는 유지합니다. 엑셀에서 저장한 상태(계산값 포함)로 올려 주세요.
          나중에 본사 DETAILS를 올리면 본사 값으로 다시 대체됩니다.
        </p>
      </div>

      {block && (
        <div className="flex flex-col gap-3 border-t border-zinc-100 pt-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {blocks && blocks.length > 1 && (
              <label className="flex items-center gap-1">
                회계연도
                <select
                  value={fyIndex}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setFyIndex(i);
                    setLastIndex(blocks[i].suggestedLastIndex);
                  }}
                  className="rounded border border-zinc-300 px-2 py-1"
                >
                  {blocks.map((b, i) => (
                    <option key={b.fiscalYear} value={i}>{b.fiscalYear}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1">
              반영할 마지막 달
              <select
                value={lastIndex}
                onChange={(e) => setLastIndex(Number(e.target.value))}
                className="rounded border border-zinc-300 px-2 py-1"
              >
                {ENV_MONTHS.map((m, i) => (
                  <option key={m} value={i}>
                    {KO_MONTH[m]}{block.completeMonths[i] ? "" : " (입력 미완료)"}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-zinc-500">
              입력 완료(매출·에너지·폐기물·용수): {block.completeMonths.map((c, i) => (c ? KO_MONTH[ENV_MONTHS[i]] : null)).filter(Boolean).join(", ") || "없음"}
            </span>
          </div>

          {preview?.error && <p className="whitespace-pre-wrap text-sm text-red-600">{preview.error}</p>}
          {preview && preview.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {preview?.payload && (
            <div className="overflow-x-auto text-xs">
              <table className="border-collapse">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="px-2 py-1 text-left font-medium">반영 미리보기</th>
                    {preview.payload.series.salesUSD.map((p) => (
                      <th key={p.month} className="px-2 py-1 text-right font-medium">{KO_MONTH[p.month]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["에너지(GJ)", "energy", 0],
                      ["폐기물(ton)", "waste", 2],
                      ["용수(㎥)", "water", 0],
                      ["매출(USD)", "salesUSD", 0],
                    ] as const
                  ).map(([label, key, d]) => (
                    <tr key={key} className="border-t border-zinc-100">
                      <td className="px-2 py-1">{label}</td>
                      {preview.payload!.series[key].map((p) => (
                        <td key={p.month} className="px-2 py-1 text-right tabular-nums">
                          {p.value.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={onApply}
            disabled={busy || !preview?.payload}
            className="h-fit w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "반영 중..." : "이 내용으로 반영"}
          </button>
        </div>
      )}

      {busy && !block && <p className="text-sm text-zinc-500">엑셀 읽는 중...</p>}
      {error && <p className="whitespace-pre-wrap text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-emerald-700">{done}</p>}
    </div>
  );
}
