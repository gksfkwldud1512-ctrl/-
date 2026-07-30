"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { FISCAL_MONTHS } from "@/lib/kpi/parseDetails";
import { SAFETY_CATEGORIES, type SafetyMonthly } from "@/lib/kpi/safetyPyramid";

const KO_MONTH: Record<string, string> = {
  Apr: "4월", May: "5월", Jun: "6월", Jul: "7월", Aug: "8월", Sep: "9월",
  Oct: "10월", Nov: "11월", Dec: "12월", Jan: "1월", Feb: "2월", Mar: "3월",
};

function cloneMonthly(monthly: SafetyMonthly): SafetyMonthly {
  const next = {} as SafetyMonthly;
  for (const c of SAFETY_CATEGORIES) next[c.key] = { ...monthly[c.key] };
  return next;
}

export function SafetyPyramidCard({
  hasImage,
  monthly,
  updatedAt,
}: {
  hasImage: boolean;
  monthly: SafetyMonthly;
  updatedAt: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<SafetyMonthly>(monthly);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  async function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/kpi/safety-pyramid/image", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "이미지 업로드에 실패했습니다.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  }

  function updateCell(catKey: (typeof SAFETY_CATEGORIES)[number]["key"], month: (typeof FISCAL_MONTHS)[number], value: string) {
    setDraft((prev) => {
      const next = cloneMonthly(prev);
      const row = next[catKey];
      if (value.trim() === "") {
        delete row[month];
      } else {
        const n = Number(value);
        if (Number.isFinite(n)) row[month] = n;
      }
      return next;
    });
    setDirty(true);
  }

  async function handleSaveTable() {
    setError(null);
    setSavingTable(true);
    try {
      const res = await fetch("/api/kpi/safety-pyramid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly: draft }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "저장에 실패했습니다.");
      }
      setDirty(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSavingTable(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800">안전 피라미드</h2>
          <p className="mt-1 text-xs text-zinc-500">
            매달 캡처 이미지를 올리고, 월별 실적 표를 입력해 두면 게시용 자료(PPT) 1번 슬라이드 왼쪽에 자동 반영됩니다.
            {updatedAt && ` 마지막 업데이트: ${new Date(updatedAt).toLocaleString("ko-KR")}`}
          </p>
        </div>
        <label className="flex h-fit cursor-pointer items-center gap-2 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
          {uploadingImage ? "업로드 중..." : "피라미드 이미지 업로드"}
          <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} disabled={uploadingImage} />
        </label>
      </div>

      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/kpi/safety-pyramid/image?t=${encodeURIComponent(updatedAt)}`}
          alt="안전 피라미드"
          className="max-h-80 w-fit rounded-md border border-zinc-200 object-contain"
        />
      ) : (
        <p className="rounded-md border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-400">
          아직 업로드된 피라미드 이미지가 없습니다.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="sticky left-0 bg-zinc-50 px-2 py-2 text-left font-medium">구분</th>
              {FISCAL_MONTHS.map((m) => (
                <th key={m} className="px-1 py-2 text-center font-medium whitespace-nowrap">{KO_MONTH[m]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {SAFETY_CATEGORIES.map((cat) => (
              <tr key={cat.key}>
                <td className="sticky left-0 bg-white px-2 py-1.5 font-medium text-zinc-700 whitespace-nowrap">{cat.label}</td>
                {FISCAL_MONTHS.map((m) => (
                  <td key={m} className="px-1 py-1.5">
                    <input
                      type="number"
                      value={draft[cat.key][m] ?? ""}
                      onChange={(e) => updateCell(cat.key, m, e.target.value)}
                      className="w-14 rounded border border-zinc-200 px-1 py-0.5 text-center text-xs"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSaveTable}
          disabled={savingTable || !dirty}
          className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {savingTable ? "저장 중..." : "실적 표 저장"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
