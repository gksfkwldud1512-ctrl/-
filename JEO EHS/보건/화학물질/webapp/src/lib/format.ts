import type { MatchStatus, OverallVerdict, ParsedThreshold, MaterialType } from "@/lib/db/schema";
import type { ReviewStatus } from "@/lib/msds/reviewStatus";

export const MATERIAL_TYPE_LABEL: Record<MaterialType, string> = {
  raw: "원재료",
  auxiliary: "부자재",
};

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  no_cas: "CAS 미상",
  no_match: "해당없음",
  matched_below_threshold: "CAS 일치 · 기준 미만",
  matched_hazardous: "유해화학물질 해당",
};

export const MATCH_STATUS_COLOR: Record<MatchStatus, string> = {
  no_cas: "bg-zinc-100 text-zinc-500",
  no_match: "bg-zinc-100 text-zinc-500",
  matched_below_threshold: "bg-amber-100 text-amber-800",
  matched_hazardous: "bg-red-100 text-red-800",
};

export const OVERALL_VERDICT_LABEL: Record<OverallVerdict, string> = {
  hazardous: "유해화학물질 함유",
  not_hazardous: "해당없음",
};

export const OVERALL_VERDICT_COLOR: Record<OverallVerdict, string> = {
  hazardous: "bg-red-100 text-red-800",
  not_hazardous: "bg-emerald-100 text-emerald-800",
};

// 목록/대시보드처럼 칸이 좁은 표에서 쓰는 축약 라벨(상세 화면은 위 전체 라벨을 그대로 쓴다).
export const OVERALL_VERDICT_SHORT_LABEL: Record<OverallVerdict, string> = {
  hazardous: "해당",
  not_hazardous: "해당없음",
};

export function formatThreshold(t: ParsedThreshold): string {
  const label = t.subcategory ? `${t.category} · ${t.subcategory}` : t.category;
  const opText = t.operator === ">" ? "초과" : "이상";
  return `${label} ${t.percent}% ${opText}`;
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  green: "정상",
  yellow: "재검토 임박",
  red: "기한 초과 · 신규 MSDS 요청 필요",
  unknown: "미확인",
};

export const REVIEW_STATUS_COLOR: Record<ReviewStatus, string> = {
  green: "bg-emerald-100 text-emerald-800",
  yellow: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  unknown: "bg-zinc-100 text-zinc-500",
};

// 목록/대시보드용 축약 라벨 — 좁은 셀에서 줄바꿈되지 않도록 짧게.
export const REVIEW_STATUS_SHORT_LABEL: Record<ReviewStatus, string> = {
  green: "정상",
  yellow: "임박",
  red: "기한초과",
  unknown: "미확인",
};

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
