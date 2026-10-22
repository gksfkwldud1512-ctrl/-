/**
 * MSDS 개정확인여부 판정 — 순수 함수(서버/클라이언트 양쪽에서 사용 가능).
 *
 * 목적: MSDS 개정일이 오래된 건은 공급업체에 재개정 여부를 확인해야 한다.
 * - no_date: 개정일 정보가 없음(검토화면에서 개정일 입력 필요)
 * - ok(확인): 개정일이 최근(REVISION_RECHECK_YEARS년 이내)이거나, 같은 개정일에 대해 수동으로 "변경사항 없음" 확인함
 * - needs_check(재개정확인필요): 개정일이 REVISION_RECHECK_YEARS년을 넘었고 아직 수동 확인 전
 *
 * 수동 확인은 "확인한 개정일"(revisionCheckedFor)을 함께 저장해 두므로, 새 MSDS 업로드/수정으로
 * 개정일이 바뀌면 자동으로 해제되어 새 개정일 기준으로 다시 판정된다.
 */
export type ReviewStatus = "ok" | "needs_check" | "no_date";

/** 개정일로부터 이 연수가 지나면 재개정확인필요로 본다. */
export const REVISION_RECHECK_YEARS = 3;

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeReviewStatus(
  revisionDate: string | null | undefined,
  revisionCheckedFor: string | null | undefined,
  today: Date = new Date()
): ReviewStatus {
  const base = parseDateOnly(revisionDate);
  if (!base) return "no_date";
  if (revisionCheckedFor && revisionCheckedFor === revisionDate) return "ok";
  const threshold = new Date(base);
  threshold.setUTCFullYear(threshold.getUTCFullYear() + REVISION_RECHECK_YEARS);
  return today.getTime() > threshold.getTime() ? "needs_check" : "ok";
}

/** 수동 확인 처리되어 있는지(현재 개정일 기준). */
export function isManuallyChecked(
  revisionDate: string | null | undefined,
  revisionCheckedFor: string | null | undefined
): boolean {
  return !!revisionDate && revisionCheckedFor === revisionDate;
}
