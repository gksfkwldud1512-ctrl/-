/**
 * MSDS 개정주기(재검토주기) 기반 신호등 판정 — 순수 함수(서버/클라이언트 양쪽에서 사용 가능).
 *
 * 다음 개정예정일 = 최근개정일(revisionDate) + 재검토주기(reviewCycleYears).
 * 색상은 "다음 개정예정일까지 남은 기간"을 기준으로 동적으로 산정한다:
 * - red(기한초과): 오늘 > 다음 개정예정일 — 공급업체에 신규 MSDS를 요청해야 함
 * - yellow(임박): 다음 개정예정일까지 1년 이내로 남음
 * - green(여유): 다음 개정예정일까지 1년 이상 남음
 * - unknown: 개정일 또는 재검토주기 정보가 없어 계산 불가
 */
export type ReviewStatus = "green" | "yellow" | "red" | "unknown";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeNextReviewDueDate(
  revisionDate: string | null | undefined,
  reviewCycleYears: number | null | undefined
): Date | null {
  const base = parseDateOnly(revisionDate);
  if (!base || !reviewCycleYears || reviewCycleYears <= 0) return null;
  const due = new Date(base);
  due.setUTCFullYear(due.getUTCFullYear() + reviewCycleYears);
  return due;
}

export function computeReviewStatus(
  revisionDate: string | null | undefined,
  reviewCycleYears: number | null | undefined,
  today: Date = new Date()
): ReviewStatus {
  const due = computeNextReviewDueDate(revisionDate, reviewCycleYears);
  if (!due) return "unknown";
  const remainingMs = due.getTime() - today.getTime();
  if (remainingMs < 0) return "red";
  if (remainingMs <= ONE_YEAR_MS) return "yellow";
  return "green";
}

/** red 상태(기한초과)일 때 "신규 MSDS를 공급업체에서 요청해야 함" 플래그. */
export function needsSupplierRenewal(
  revisionDate: string | null | undefined,
  reviewCycleYears: number | null | undefined,
  today: Date = new Date()
): boolean {
  return computeReviewStatus(revisionDate, reviewCycleYears, today) === "red";
}
