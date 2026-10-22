import type { ReactNode } from "react";

/** 참고 이미지의 반투명 패널(유리 느낌 + 푸른 테두리). */
export function Panel({
  title, action, children, className = "", icon,
}: { title?: string; action?: ReactNode; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-cc-line/80 bg-cc-panel/85 shadow-[0_0_28px_rgba(40,140,228,0.10)] backdrop-blur-sm ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3">
          <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-cc-text">{icon}{title}</h2>
          {action}
        </header>
      )}
      <div className="flex grow flex-col justify-center p-4 pt-3">{children}</div>
    </section>
  );
}

export function Row({ label, value, ok }: { label: string; value?: ReactNode; ok?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 text-sm last:border-0">
      <span className="flex items-center gap-2 text-sky-100/90">
        {ok !== undefined && <span aria-hidden className={ok ? "text-cc-green" : "text-slate-500"}>{ok ? "✓" : "✕"}</span>}
        {label}
      </span>
      {value !== undefined && <span className="text-xs text-sky-200/70">{value}</span>}
      {ok !== undefined && <span className="sr-only">{ok ? "허용" : "불가"}</span>}
    </li>
  );
}
