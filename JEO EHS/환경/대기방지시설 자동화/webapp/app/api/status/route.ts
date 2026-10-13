import { NextResponse } from "next/server";
import { loadManifests } from "@/lib/water/manifests";
import { buildWastewaterPlan } from "@/lib/water/wastewaterPlan";
import { loadAirRecords } from "@/lib/airRecords";

export const dynamic = "force-dynamic";

/**
 * 종합업무현황판용 월별 작성 현황.
 * - 폐수일지: 위탁인계서로 일지를 만들 수 있는 월(1/1 ~ 마지막 인계일). 마지막 인계일이 속한 달은 partialUntil로 알린다.
 * - 대기운용기록부: 배출구가동시간목록·시설운전사항목록 엑셀을 모두 내려받은 월
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  const [manifests, airRecords] = await Promise.all([loadManifests(), loadAirRecords()]);

  const plan = buildWastewaterPlan(manifests, year);
  const waterMonths = new Set<number>();
  for (const d of plan.days) waterMonths.add(Number(d.date.slice(5, 7)));
  const lastDay = plan.days.at(-1)?.date ?? null;
  let partialUntil: string | null = null;
  if (lastDay) {
    const [y, m, d] = lastDay.split("-").map(Number);
    const monthEnd = new Date(y, m, 0).getDate();
    if (d < monthEnd) partialUntil = lastDay;
  }

  const airByMonth = (kind: "gongdong" | "unjeon") => {
    const set = new Set<number>();
    for (const r of airRecords) if (r.kind === kind && r.year === year) set.add(r.month);
    return set;
  };
  const gongdong = airByMonth("gongdong");
  const unjeon = airByMonth("unjeon");
  const airBoth = [...gongdong].filter((m) => unjeon.has(m)).sort((a, b) => a - b);

  return NextResponse.json({
    year,
    water: { months: [...waterMonths].sort((a, b) => a - b), lastDate: lastDay, partialUntil, manifestCount: manifests.length },
    air: { gongdongMonths: [...gongdong].sort((a, b) => a - b), unjeonMonths: [...unjeon].sort((a, b) => a - b), bothMonths: airBoth },
  });
}
