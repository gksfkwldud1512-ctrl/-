import { NextResponse } from "next/server";
import { listMixtures } from "@/lib/db/repo";
import { computeReviewStatus } from "@/lib/msds/reviewStatus";

export const dynamic = "force-dynamic";

/** 종합업무현황판용 MSDS 개정확인 현황 — '재개정확인필요'가 남아 있으면 해당, 없으면 완료로 판정한다. */
export async function GET() {
  const mixtures = await listMixtures();
  let needsCheck = 0;
  let noDate = 0;
  let ok = 0;
  const needsCheckNames: string[] = [];
  for (const m of mixtures) {
    const status = computeReviewStatus(m.revisionDate, m.revisionCheckedFor);
    if (status === "needs_check") {
      needsCheck++;
      if (needsCheckNames.length < 5) needsCheckNames.push(m.productName);
    } else if (status === "no_date") noDate++;
    else ok++;
  }
  return NextResponse.json({ total: mixtures.length, needsCheck, noDate, ok, needsCheckNames });
}
