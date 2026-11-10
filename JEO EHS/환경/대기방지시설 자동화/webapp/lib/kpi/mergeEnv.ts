import type { KpiSummary, MonthlyPoint, SeriesKey, BreakdownSeriesKey } from "./parseDetails";
import type { EnvPayload } from "./parseEnvSheet";

const SERIES_KEYS: SeriesKey[] = ["energy", "waste", "water", "waterDischarge", "scope1", "scope2", "salesUSD"];
const BREAKDOWN_KEYS: BreakdownSeriesKey[] = ["energy", "waste", "water", "waterDischarge"];

function isPoint(p: unknown): p is MonthlyPoint {
  const o = p as MonthlyPoint;
  return (
    !!o && typeof o.fiscalYear === "string" && typeof o.month === "string" &&
    Number.isFinite(o.monthNumber) && Number.isFinite(o.calendarYear) && Number.isFinite(o.value)
  );
}

/** 클라이언트에서 온 JSON이 EnvPayload 모양인지 검사한다(잘못된 값이 저장소를 오염시키지 않도록). */
export function validateEnvPayload(body: unknown): EnvPayload {
  const b = body as EnvPayload;
  if (!b || typeof b !== "object") throw new Error("요청 형식이 올바르지 않습니다.");
  if (!/^\d{4}\/\d{4}$/.test(b.fiscalYear ?? "")) throw new Error("회계연도 형식이 올바르지 않습니다.");
  for (const k of SERIES_KEYS) {
    if (!Array.isArray(b.series?.[k]) || !b.series[k].every(isPoint)) throw new Error(`series.${k} 형식이 올바르지 않습니다.`);
    if (b.series[k].some((p) => p.fiscalYear !== b.fiscalYear)) throw new Error(`series.${k}에 다른 회계연도 값이 섞여 있습니다.`);
  }
  for (const k of BREAKDOWN_KEYS) {
    const g = b.breakdown?.[k];
    if (!g || typeof g !== "object") throw new Error(`breakdown.${k} 형식이 올바르지 않습니다.`);
    for (const pts of Object.values(g)) {
      if (!Array.isArray(pts) || !pts.every(isPoint) || pts.some((p) => p.fiscalYear !== b.fiscalYear))
        throw new Error(`breakdown.${k} 형식이 올바르지 않습니다.`);
    }
  }
  return b;
}

const sortPoints = (pts: MonthlyPoint[]) =>
  pts.sort((a, b) => a.calendarYear - b.calendarYear || a.monthNumber - b.monthNumber);

/**
 * 기존 요약(본사 DETAILS 업로드분)에 환경종합자료 값을 채운다.
 * - 다른 회계연도(작년 이전)는 그대로 보존한다.
 * - 같은 회계연도라도 본사 DETAILS 실적이 이미 있는 달은 본사 값을 그대로 둔다(본사가 기준).
 *   그 외의 달만 환경종합자료 값(source: "env")으로 채우고, 이전에 넣었던 env 값은 새 값으로 교체한다.
 * - 매출은 본사가 아직 실적이 없는 달에 계획치를 넣어 두므로, 본사 실적이 있는 달이 아니면 환경종합자료 실적으로 교체한다.
 * 기존 요약이 없으면 새로 만든다.
 */
export function mergeEnvPayload(existing: KpiSummary | null, env: EnvPayload): KpiSummary {
  const empty = (): KpiSummary => ({
    uploadedAt: "",
    sourceFilename: "",
    series: { energy: [], waste: [], water: [], waterDischarge: [], scope1: [], scope2: [], salesUSD: [] },
    breakdown: { energy: {}, waste: {}, water: {}, waterDischarge: {} },
  });
  const base = existing ?? empty();

  // 본사 DETAILS 실적이 있는 달 = 에너지 합계가 본사(env 아님) 값으로 존재하는 달
  const hqMonths = new Set(
    (base.series.energy ?? [])
      .filter((p) => p.fiscalYear === env.fiscalYear && p.source !== "env" && p.value > 0)
      .map((p) => p.month)
  );
  const keepExisting = (pts: MonthlyPoint[]) =>
    pts.filter((p) => p.fiscalYear !== env.fiscalYear || (p.source !== "env" && hqMonths.has(p.month)));
  const takeEnv = (pts: MonthlyPoint[]) => pts.filter((p) => !hqMonths.has(p.month));

  const series = {} as KpiSummary["series"];
  for (const k of SERIES_KEYS) series[k] = sortPoints([...keepExisting(base.series[k] ?? []), ...takeEnv(env.series[k])]);

  const breakdown = {} as KpiSummary["breakdown"];
  for (const k of BREAKDOWN_KEYS) {
    const merged: Record<string, MonthlyPoint[]> = {};
    for (const [name, pts] of Object.entries(base.breakdown?.[k] ?? {})) {
      const kept = keepExisting(pts);
      if (kept.length) merged[name] = kept;
    }
    for (const [name, pts] of Object.entries(env.breakdown[k])) {
      merged[name] = [...(merged[name] ?? []), ...takeEnv(pts)];
    }
    for (const name of Object.keys(merged)) sortPoints(merged[name]);
    breakdown[k] = merged;
  }

  const hqNote = hqMonths.size ? `, 본사 실적 ${hqMonths.size}개월 유지` : "";
  return {
    uploadedAt: new Date().toISOString(),
    sourceFilename: `${env.sourceFilename} (환경종합자료 · ${env.fiscalYear} ${env.lastMonth}월까지${hqNote})`,
    series,
    breakdown,
  };
}
