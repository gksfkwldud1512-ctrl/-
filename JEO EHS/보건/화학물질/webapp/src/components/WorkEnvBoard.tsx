"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PRODUCT_STATUS_LABEL,
  VERDICT_LABEL,
  type ProcessInfo,
  type ProcessVerdict,
  type ProductInfo,
  type ProductStatus,
} from "@/lib/workEnv";
import type { GuideItem } from "@/lib/workEnvGuide";

type Criteria = {
  tempMonthlyHoursLessThan: number;
  tempRepeatMinMonthlyHours: number;
  shortDailyHoursLessThan: number;
  verified: boolean;
};

const VERDICT_STYLE: Record<ProcessVerdict, string> = {
  target: "bg-red-100 text-red-800",
  exclude_candidate: "bg-amber-100 text-amber-800",
  excluded: "bg-sky-100 text-sky-800",
  none: "bg-zinc-100 text-zinc-500",
};

const STATUS_STYLE: Record<ProductStatus, string> = {
  target: "bg-red-100 text-red-800",
  exclude_candidate: "bg-amber-100 text-amber-800",
  excluded: "bg-sky-100 text-sky-800",
  not_target: "bg-zinc-100 text-zinc-500",
};

async function post(body: unknown): Promise<string | null> {
  try {
    const res = await fetch("/api/work-env", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "저장에 실패했습니다.";
    return null;
  } catch {
    return "네트워크 오류로 저장하지 못했습니다.";
  }
}

export function WorkEnvBoard({
  processes,
  updatedAt,
  criteria,
  guide,
}: {
  processes: ProcessInfo[];
  updatedAt: string;
  criteria: Criteria;
  guide: { notice: string; items: GuideItem[] };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"status" | "guide">("status");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(body: unknown) {
    setBusy(true);
    setError(null);
    const err = await post(body);
    setBusy(false);
    if (err) setError(err);
    else router.refresh();
  }

  const total = {
    headcount: processes.reduce((a, p) => a + p.headcount, 0),
    night: processes.reduce((a, p) => a + p.nightCount, 0),
    target: processes.filter((p) => p.verdict === "target").length,
  };
  const departments = Array.from(new Set(processes.map((p) => p.department)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["status", "guide"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}
          >
            {t === "status" ? "공정별 예비조사" : "예비조사 자료실"}
          </button>
        ))}
        <a
          href="/api/export/work-env"
          className="ml-auto rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          예비조사표 엑셀 다운로드
        </a>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tab === "guide" ? (
        <GuidePanel notice={guide.notice} items={guide.items} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <Stat label="전체 인원" value={`${total.headcount}명`} />
            <Stat label="야간근무자" value={`${total.night}명`} />
            <Stat label="측정 대상 공정" value={`${total.target}개`} />
          </div>
          {!criteria.verified && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              제외 기준(임시작업 월 {criteria.tempMonthlyHoursLessThan}시간 미만, 단시간작업 1일 {criteria.shortDailyHoursLessThan}시간 미만)은 아직 법령 원문과
              대조하지 않은 값입니다. 최종 제외는 원문 확인 후 담당자가 확정하세요.
              {updatedAt && ` 마지막 저장: ${new Date(updatedAt).toLocaleString("ko-KR")}`}
            </p>
          )}

          {departments.map((dept) => (
            <section key={dept} className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <h2 className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800">{dept}</h2>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">공정</th>
                    <th className="px-3 py-2 font-medium">인원</th>
                    <th className="px-3 py-2 font-medium">야간</th>
                    <th className="px-3 py-2 font-medium">사용 부자재</th>
                    <th className="px-3 py-2 font-medium">측정 대상 성분</th>
                    <th className="px-3 py-2 font-medium">판정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {processes
                    .filter((p) => p.department === dept)
                    .map((p) => {
                      const key = `${p.department}|${p.process}`;
                      const open = openKey === key;
                      return (
                        <ProcessRows
                          key={key}
                          p={p}
                          open={open}
                          onToggle={() => setOpenKey(open ? null : key)}
                          busy={busy}
                          run={run}
                        />
                      );
                    })}
                </tbody>
              </table>
            </section>
          ))}
          {processes.length === 0 && <p className="text-sm text-zinc-400">등록된 직원·부자재가 없습니다.</p>}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function ProcessRows({
  p,
  open,
  onToggle,
  busy,
  run,
}: {
  p: ProcessInfo;
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  run: (body: unknown) => Promise<void>;
}) {
  const names = p.measureIngredientNames;
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-zinc-50">
        <td className="px-3 py-2 font-medium text-zinc-800">{open ? "▾ " : "▸ "}{p.process}</td>
        <td className="px-3 py-2 text-zinc-700">{p.headcount}명</td>
        <td className="px-3 py-2 text-zinc-700">{p.nightCount}명</td>
        <td className="px-3 py-2 text-zinc-700">{p.products.length}종</td>
        <td className="px-3 py-2 text-xs text-zinc-600">{names.length ? names.join(", ") : "-"}</td>
        <td className="px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${VERDICT_STYLE[p.verdict]}`}>{VERDICT_LABEL[p.verdict]}</span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-zinc-50 px-3 py-4">
            <div className="flex flex-col gap-5">
              <PeoplePanel p={p} busy={busy} run={run} />
              <ProductsPanel p={p} busy={busy} run={run} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PeoplePanel({ p, busy, run }: { p: ProcessInfo; busy: boolean; run: (b: unknown) => Promise<void> }) {
  if (p.people.length === 0) {
    return <p className="text-xs text-zinc-400">이 공정에는 사원명부 소속 인원이 없습니다(공정공통 부자재 등).</p>;
  }
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-zinc-600">
        인원 {p.headcount}명 · 야간근무자 {p.nightCount}명 (야간근무자에 체크)
      </p>
      <div className="flex flex-wrap gap-2">
        {p.people.map((x) => (
          <label
            key={x.key}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${x.night ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-zinc-200 bg-white text-zinc-700"}`}
          >
            <input
              type="checkbox"
              checked={x.night}
              disabled={busy}
              onChange={(e) => void run({ type: "night", key: x.key, value: e.target.checked })}
            />
            {x.name}
            {x.night && <span className="text-[11px] font-medium">야간</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

function ProductsPanel({ p, busy, run }: { p: ProcessInfo; busy: boolean; run: (b: unknown) => Promise<void> }) {
  if (p.products.length === 0) return <p className="text-xs text-zinc-400">이 공정에 등록된 부자재가 없습니다.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-zinc-600">사용 부자재 {p.products.length}종</p>
      {p.products.map((x) => (
        <ProductCard key={x.mixtureId} x={x} busy={busy} run={run} />
      ))}
    </div>
  );
}

function ProductCard({ x, busy, run }: { x: ProductInfo; busy: boolean; run: (b: unknown) => Promise<void> }) {
  const ex = x.exclusion;
  const [monthly, setMonthly] = useState(ex?.monthlyHours?.toString() ?? "");
  const [daily, setDaily] = useState(ex?.dailyHours?.toString() ?? "");
  const [repM, setRepM] = useState(ex?.repeatsMonthly ?? false);
  const [repD, setRepD] = useState(ex?.repeatsDaily ?? false);
  const [reason, setReason] = useState(ex?.reason ?? "");
  const [by, setBy] = useState(ex?.confirmedBy ?? "");
  const isTarget = x.measureIngredients.length > 0;

  const save = (confirmedBy: string) =>
    run({
      type: "exclusion",
      exclusion: {
        mixtureId: x.mixtureId,
        monthlyHours: monthly,
        dailyHours: daily,
        repeatsMonthly: repM,
        repeatsDaily: repD,
        reason,
        confirmedBy,
      },
    });

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-zinc-800">{x.productName}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[x.status]}`}>{PRODUCT_STATUS_LABEL[x.status]}</span>
        {x.controlled && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">관리대상유해물질 포함</span>}
      </div>

      {isTarget ? (
        <>
          <ul className="mt-2 text-xs text-zinc-600">
            {x.measureIngredients.map((i) => (
              <li key={`${i.name}-${i.casNo}`}>
                · {i.name} {i.casNo ? `(CAS ${i.casNo})` : ""} {i.controlled ? "· 관리대상" : ""}
              </li>
            ))}
          </ul>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              월 사용시간(h)
              <input value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" className="rounded border border-zinc-300 px-2 py-1 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              1일 사용시간(h)
              <input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" className="rounded border border-zinc-300 px-2 py-1 text-sm" />
            </label>
            <label className="flex items-end gap-1.5 pb-1">
              <input type="checkbox" checked={repM} onChange={(e) => setRepM(e.target.checked)} /> 월 10시간 이상 매월 반복
            </label>
            <label className="flex items-end gap-1.5 pb-1">
              <input type="checkbox" checked={repD} onChange={(e) => setRepD(e.target.checked)} /> 1시간 미만이 매일 반복
            </label>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-zinc-600 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              제외 사유(작업 내용)
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="rounded border border-zinc-300 px-2 py-1 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              확인 담당자(입력해야 제외 확정)
              <input value={by} onChange={(e) => setBy(e.target.value)} maxLength={40} className="rounded border border-zinc-300 px-2 py-1 text-sm" />
            </label>
          </div>

          {x.evalResult.candidate ? (
            <p className="mt-2 text-xs text-amber-800">제외 후보: {x.evalResult.reasons.join(" / ")}</p>
          ) : ex ? (
            <p className="mt-2 text-xs text-zinc-500">입력한 시간으로는 제외 기준에 해당하지 않아 측정 대상으로 유지됩니다.</p>
          ) : null}
          {ex?.confirmedBy && ex.confirmedAt && (
            <p className="mt-1 text-xs text-sky-800">
              확인: {ex.confirmedBy} · {new Date(ex.confirmedAt).toLocaleDateString("ko-KR")}
            </p>
          )}

          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void save(by.trim())} className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
              {by.trim() ? "저장·제외 확인" : "저장(후보만)"}
            </button>
            {ex && (
              <button type="button" disabled={busy} onClick={() => void run({ type: "exclusion-clear", mixtureId: x.mixtureId })} className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-600 disabled:opacity-50">
                입력 지우기
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs text-zinc-400">작업환경측정 대상 성분이 없어 제외 판단이 필요하지 않습니다.</p>
      )}
    </div>
  );
}

function GuidePanel({ notice, items }: { notice: string; items: GuideItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>
      {items.map((g) => (
        <div key={g.title} className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-zinc-900">{g.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${g.verified ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
              {g.verified ? `원문 확인${g.article ? ` · ${g.article}` : ""}` : "확인필요"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">{g.summary}</p>
          <p className="mt-2 text-xs text-zinc-500">
            출처:{" "}
            {g.url ? (
              <a href={g.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {g.source}
              </a>
            ) : (
              g.source
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
