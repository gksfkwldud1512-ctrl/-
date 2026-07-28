import type { MatchStatus, OverallVerdict, ParsedThreshold, MaterialType } from "@/lib/db/schema";

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

export function formatThreshold(t: ParsedThreshold): string {
  const label = t.subcategory ? `${t.category} · ${t.subcategory}` : t.category;
  const opText = t.operator === ">" ? "초과" : "이상";
  return `${label} ${t.percent}% ${opText}`;
}

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
