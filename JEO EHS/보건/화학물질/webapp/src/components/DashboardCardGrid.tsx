"use client";

import { useState } from "react";
import Link from "next/link";
import { REVIEW_STATUS_COLOR, REVIEW_STATUS_SHORT_LABEL } from "@/lib/format";
import type { ReviewStatus } from "@/lib/msds/reviewStatus";

export type CardProductSummary = {
  mixtureId: string;
  productName: string;
  chemicalsActFlag: boolean;
  categoryFlags: Record<string, boolean>;
  reviewStatus: ReviewStatus;
  ppeText: string | null;
};

export type CardSummary = {
  key: string;
  title: string;
  department: string; // export API 호출용 (원재료는 COMMON_DEPARTMENT)
  workProcess: string | null;
  isRaw: boolean;
  products: CardProductSummary[];
};

const REVIEW_ORDER: Record<ReviewStatus, number> = { red: 0, yellow: 1, unknown: 2, green: 3 };

function worstReviewStatus(products: CardProductSummary[]): ReviewStatus {
  if (products.length === 0) return "unknown";
  return products.reduce<ReviewStatus>(
    (worst, p) => (REVIEW_ORDER[p.reviewStatus] < REVIEW_ORDER[worst] ? p.reviewStatus : worst),
    "green"
  );
}

export function DashboardCardGrid({
  cards,
  categoryDefs,
}: {
  cards: CardSummary[];
  categoryDefs: { key: string; label: string }[];
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (cards.length === 0) {
    return <p className="px-1 py-6 text-sm text-zinc-400">확정된 MSDS가 없습니다.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const open = openKey === card.key;
        const status = worstReviewStatus(card.products);
        const anyChemHazard = card.products.some((p) => p.chemicalsActFlag);
        const matchedCategoryKeys = categoryDefs.filter((c) => card.products.some((p) => p.categoryFlags[c.key]));
        const exportQs = `department=${encodeURIComponent(card.department)}${
          card.workProcess ? `&workProcess=${encodeURIComponent(card.workProcess)}` : ""
        }`;

        return (
          <div
            key={card.key}
            className={`flex flex-col rounded-lg border bg-white transition-shadow ${
              open ? "col-span-full border-zinc-300 shadow-md" : "border-zinc-200 hover:shadow-sm"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenKey(open ? null : card.key)}
              className="flex w-full flex-col gap-2 px-4 py-4 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-900">{card.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${REVIEW_STATUS_COLOR[status]}`}>
                  {REVIEW_STATUS_SHORT_LABEL[status]}
                </span>
              </div>
              <div className="text-xs text-zinc-500">제품 {card.products.length}건</div>
              <div className="flex flex-wrap gap-1">
                {anyChemHazard && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800">
                    화관법 유해물질
                  </span>
                )}
                {matchedCategoryKeys.map((c) => (
                  <span key={c.key} className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800">
                    {c.label.replace(" 대상 유해인자", "")}
                  </span>
                ))}
                {!anyChemHazard && matchedCategoryKeys.length === 0 && (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400">해당없음</span>
                )}
              </div>
            </button>

            {open && (
              <div className="flex flex-col gap-4 border-t border-zinc-100 px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/export/training-signoff?${exportQs}`}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    교육서명지 다운로드
                  </a>
                  <a
                    href={`/api/export/training-substances?${exportQs}`}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    교육물질 목록 다운로드
                  </a>
                </div>

                <div className="overflow-x-auto rounded-lg border border-zinc-200">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-zinc-50 text-left text-zinc-500">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-2 font-medium">제품명</th>
                        <th className="whitespace-nowrap px-3 py-2 font-medium">화관법</th>
                        {categoryDefs.map((c) => (
                          <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                            {c.label.replace(" 대상 유해인자", "")}
                          </th>
                        ))}
                        <th className="whitespace-nowrap px-3 py-2 font-medium">개정주기</th>
                        <th className="px-3 py-2 font-medium">상세</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {card.products.map((p) => (
                        <tr key={p.mixtureId}>
                          <td className="px-3 py-2 text-zinc-800">{p.productName}</td>
                          <td className="px-3 py-2 text-center">
                            <Flag on={p.chemicalsActFlag} />
                          </td>
                          {categoryDefs.map((c) => (
                            <td key={c.key} className="px-3 py-2 text-center">
                              <Flag on={!!p.categoryFlags[c.key]} />
                            </td>
                          ))}
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${REVIEW_STATUS_COLOR[p.reviewStatus]}`}>
                              {REVIEW_STATUS_SHORT_LABEL[p.reviewStatus]}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <Link href={`/mixtures/${p.mixtureId}`} className="text-xs text-zinc-500 underline hover:text-zinc-800">
                              보기
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-zinc-700">보호구(MSDS 8장 발췌)</span>
                  {card.products.filter((p) => p.ppeText).length === 0 ? (
                    <p className="text-xs text-zinc-400">등록된 보호구 정보가 없습니다.</p>
                  ) : (
                    card.products
                      .filter((p) => p.ppeText)
                      .map((p) => (
                        <details key={p.mixtureId} className="rounded-md border border-zinc-200 px-3 py-2 text-xs">
                          <summary className="cursor-pointer font-medium text-zinc-700">{p.productName}</summary>
                          <p className="mt-2 whitespace-pre-wrap text-zinc-600">{p.ppeText}</p>
                        </details>
                      ))
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Flag({ on }: { on: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${on ? "bg-red-100 text-red-800" : "bg-zinc-100 text-zinc-400"}`}>
      {on ? "O" : "X"}
    </span>
  );
}
