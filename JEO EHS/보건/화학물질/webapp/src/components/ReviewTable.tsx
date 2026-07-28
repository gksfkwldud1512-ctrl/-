"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MaterialType } from "@/lib/db/schema";

type Row = {
  key: string;
  ingredientName: string;
  casNo: string;
  contentPercentRaw: string;
};

function newKey() {
  return Math.random().toString(36).slice(2);
}

export function ReviewTable({
  mixtureId,
  initialProductName,
  initialManufacturer,
  initialMaterialType,
  initialRows,
}: {
  mixtureId: string;
  initialProductName: string;
  initialManufacturer: string | null;
  initialMaterialType: MaterialType;
  initialRows: { ingredientName: string; casNo: string | null; contentPercentRaw: string | null }[];
}) {
  const router = useRouter();
  const [productName, setProductName] = useState(initialProductName);
  const [manufacturer, setManufacturer] = useState(initialManufacturer ?? "");
  const [materialType, setMaterialType] = useState<MaterialType>(initialMaterialType);
  const [rows, setRows] = useState<Row[]>(
    initialRows.length > 0
      ? initialRows.map((r) => ({
          key: newKey(),
          ingredientName: r.ingredientName,
          casNo: r.casNo ?? "",
          contentPercentRaw: r.contentPercentRaw ?? "",
        }))
      : [{ key: newKey(), ingredientName: "", casNo: "", contentPercentRaw: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateRow(key: string, field: keyof Omit<Row, "key">, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { key: newKey(), ingredientName: "", casNo: "", contentPercentRaw: "" }]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function saveDraft(): Promise<boolean> {
    setError(null);
    const res = await fetch(`/api/mixtures/${mixtureId}/ingredients`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productName,
        manufacturer: manufacturer.trim() || null,
        materialType,
        ingredients: rows
          .filter((r) => r.ingredientName.trim() !== "" || r.casNo.trim() !== "")
          .map((r) => ({
            ingredientName: r.ingredientName.trim() || "(미확인)",
            casNo: r.casNo.trim() || null,
            contentPercentRaw: r.contentPercentRaw.trim() || null,
          })),
      }),
    });
    if (!res.ok) {
      setError("저장에 실패했습니다.");
      return false;
    }
    return true;
  }

  async function handleSaveDraft() {
    setSaving(true);
    const ok = await saveDraft();
    setSaving(false);
    if (ok) {
      setMessage("저장되었습니다.");
      setTimeout(() => setMessage(null), 2000);
    }
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    const ok = await saveDraft();
    if (!ok) {
      setSaving(false);
      return;
    }
    const res = await fetch(`/api/mixtures/${mixtureId}/confirm`, { method: "POST" });
    if (!res.ok) {
      setError("확정에 실패했습니다.");
      setSaving(false);
      return;
    }
    router.push(`/mixtures/${mixtureId}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        PDF에서 자동으로 추출한 초안입니다. 성분명/CAS번호/함유량과 제조사를 확인하고 필요하면 직접
        수정한 뒤 저장해 주세요. 다줄 성분명이나 스캔 이미지 PDF는 자동 인식이 정확하지 않을 수 있습니다.
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-700" htmlFor="productName">
            화학물질명(제품명)
          </label>
          <input
            id="productName"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-700" htmlFor="manufacturer">
            제조사
          </label>
          <input
            id="manufacturer"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            placeholder="PDF에서 자동 추출을 시도합니다"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-zinc-700" htmlFor="materialType">
            구분
          </label>
          <select
            id="materialType"
            value={materialType}
            onChange={(e) => setMaterialType(e.target.value as MaterialType)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="raw">원재료</option>
            <option value="auxiliary">부자재</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">화학물질명</th>
              <th className="px-3 py-2 font-medium">CAS번호</th>
              <th className="px-3 py-2 font-medium">함유량(%)</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-2">
                  <input
                    value={row.ingredientName}
                    onChange={(e) => updateRow(row.key, "ingredientName", e.target.value)}
                    className="w-full rounded border border-zinc-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={row.casNo}
                    onChange={(e) => updateRow(row.key, "casNo", e.target.value)}
                    placeholder="000-00-0"
                    className="w-full rounded border border-zinc-200 px-2 py-1 font-mono"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={row.contentPercentRaw}
                    onChange={(e) => updateRow(row.key, "contentPercentRaw", e.target.value)}
                    placeholder="예: 10~30"
                    className="w-full rounded border border-zinc-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="text-zinc-400 hover:text-red-600"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          + 성분 행 추가
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
        >
          저장
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          확인 및 저장
        </button>
      </div>
      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
