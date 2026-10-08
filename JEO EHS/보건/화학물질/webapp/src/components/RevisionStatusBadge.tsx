"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REVIEW_STATUS_COLOR, REVIEW_STATUS_LABEL } from "@/lib/format";
import type { ReviewStatus } from "@/lib/msds/reviewStatus";

/**
 * 개정확인여부 배지.
 * - 재개정확인필요: 클릭하면 "변경사항 없음"으로 확인 처리(DB 저장)
 * - 수동 확인된 건: '확인' 배지 옆에 '취소' 링크로 되돌릴 수 있음
 */
export function RevisionStatusBadge({
  mixtureId,
  status,
  manuallyChecked,
  size = "sm",
}: {
  mixtureId: string;
  status: ReviewStatus;
  manuallyChecked: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setChecked(checked: boolean) {
    setBusy(true);
    const res = await fetch(`/api/mixtures/${mixtureId}/revision-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked }),
    });
    if (!res.ok) {
      alert("저장에 실패했습니다.");
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  const base = `w-fit whitespace-nowrap rounded-full font-medium ${
    size === "md" ? "px-3 py-1 text-sm" : "px-2 py-1 text-xs"
  } ${REVIEW_STATUS_COLOR[status]}`;

  if (status === "needs_check") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setChecked(true)}
        title="클릭하면 변경사항 없음으로 확인 처리됩니다"
        className={`${base} cursor-pointer ring-1 ring-red-300 hover:bg-red-200 disabled:opacity-50`}
      >
        {REVIEW_STATUS_LABEL[status]}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={base}>{manuallyChecked ? "확인 (변경없음)" : REVIEW_STATUS_LABEL[status]}</span>
      {manuallyChecked && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setChecked(false)}
          className="text-[11px] text-zinc-400 underline hover:text-zinc-700 disabled:opacity-50"
        >
          취소
        </button>
      )}
    </span>
  );
}
