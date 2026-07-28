export const GRADE_LABEL: Record<string, string> = {
  A: "A · 정상",
  B: "B · 관찰",
  C1: "C1 · 직업병 요관찰",
  C2: "C2 · 일반질병 요관찰",
  CN: "CN · 야간작업 요관찰",
  R: "R · 질환의심(추가검사)",
  D1: "D1 · 직업병 유소견",
  D2: "D2 · 일반질병 유소견",
};

export const GRADE_COLOR: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800",
  B: "bg-zinc-100 text-zinc-700",
  C1: "bg-amber-100 text-amber-800",
  C2: "bg-amber-100 text-amber-800",
  CN: "bg-amber-100 text-amber-800",
  R: "bg-orange-100 text-orange-800",
  D1: "bg-red-100 text-red-800",
  D2: "bg-red-100 text-red-800",
};

export function gradeLabel(grade: string | null): string {
  if (!grade) return "미확인";
  return GRADE_LABEL[grade] ?? grade;
}

export function gradeColor(grade: string | null): string {
  if (!grade) return "bg-zinc-100 text-zinc-500";
  return GRADE_COLOR[grade] ?? "bg-zinc-100 text-zinc-700";
}
