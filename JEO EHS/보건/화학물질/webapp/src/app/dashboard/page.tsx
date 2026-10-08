import Link from "next/link";
import { getDashboardData } from "@/lib/db/repo";
import { COMMON_DEPARTMENT } from "@/lib/constants";
import { INDUSTRIAL_SAFETY_ACT_CATEGORIES } from "@/lib/law/categories";
import { DashboardCardGrid, type CardProductSummary, type CardSummary } from "@/components/DashboardCardGrid";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const rows = await getDashboardData();

  // mixtureId 단위로 성분 플래그를 OR 집계해 "제품 1건 = 1행"으로 만든다.
  const productsByMixture = new Map<string, CardProductSummary>();
  for (const r of rows) {
    const existing = productsByMixture.get(r.mixtureId);
    if (!existing) {
      productsByMixture.set(r.mixtureId, {
        mixtureId: r.mixtureId,
        productName: r.productName,
        chemicalsActFlag: r.chemicalsActFlag,
        categoryFlags: { ...r.categoryFlags },
        reviewStatus: r.reviewStatus,
        manuallyChecked: r.manuallyChecked,
        ppeText: r.ppeText,
      });
    } else {
      existing.chemicalsActFlag = existing.chemicalsActFlag || r.chemicalsActFlag;
      for (const key of Object.keys(r.categoryFlags)) {
        existing.categoryFlags[key] = existing.categoryFlags[key] || r.categoryFlags[key];
      }
    }
  }

  // (부서, 공정) 조합별 카드 — 원재료는 부서/공정 구분 없이 "원재료" 카드 하나로 합친다.
  const cardMap = new Map<string, CardSummary>();
  const seenMixtureRow = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!seenMixtureRow.has(r.mixtureId)) seenMixtureRow.set(r.mixtureId, r);

  for (const [mixtureId, row] of seenMixtureRow) {
    const product = productsByMixture.get(mixtureId)!;
    const isRaw = row.department === COMMON_DEPARTMENT;
    const key = isRaw ? "__raw__" : `${row.department}__${row.workProcess}`;
    if (!cardMap.has(key)) {
      cardMap.set(key, {
        key,
        title: isRaw ? "원재료 (공통)" : `${row.department} · ${row.workProcess}`,
        department: row.department,
        workProcess: isRaw ? null : row.workProcess,
        isRaw,
        products: [],
      });
    }
    cardMap.get(key)!.products.push(product);
  }

  const cards = Array.from(cardMap.values()).sort((a, b) => {
    if (a.isRaw !== b.isRaw) return a.isRaw ? -1 : 1;
    return a.title.localeCompare(b.title, "ko");
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← 목록으로
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">부서·법령별 대시보드</h1>
            <p className="mt-1 text-sm text-zinc-500">
              박스를 클릭하면 해당 부서·공정(또는 원재료)의 물질별 법령 해당 여부, 보호구, 교육
              서명지/물질목록 다운로드를 볼 수 있습니다. (총 {cards.length}개 박스)
            </p>
          </div>
          <a
            href="/api/export/mixtures"
            className="h-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            전체 요약 엑셀 다운로드
          </a>
        </div>
      </div>

      <DashboardCardGrid cards={cards} categoryDefs={INDUSTRIAL_SAFETY_ACT_CATEGORIES} />
    </main>
  );
}
