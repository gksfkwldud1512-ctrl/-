"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteMixtureButton({ mixtureId, productName }: { mixtureId: string; productName: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`"${productName}" 항목을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/mixtures/${mixtureId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("삭제에 실패했습니다.");
      setDeleting(false);
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="text-xs font-medium text-zinc-400 hover:text-red-600 disabled:opacity-50"
    >
      삭제
    </button>
  );
}
