"use client";

import { useState, type ReactNode } from "react";

/** 제목을 클릭하면 하위 내용을 접었다 펼쳤다 할 수 있는 섹션. 목록 화면의 원재료/부자재 표에 사용. */
export function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-2 text-lg font-semibold text-zinc-800"
      >
        <span className={`inline-block text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {title} <span className="text-sm font-normal text-zinc-400">({count}건)</span>
      </button>
      {open && children}
    </section>
  );
}
