export type Category = "safety" | "health" | "environment" | "gas" | "hazmat";

export const CATEGORY_LABEL: Record<Category, string> = {
  safety: "안전",
  health: "보건",
  environment: "환경",
  gas: "가스",
  hazmat: "위험물",
};

export const CATEGORY_ICON: Record<Category, string> = {
  safety: "🦺",
  health: "🩺",
  environment: "🌱",
  gas: "🔥",
  hazmat: "⚗️",
};

export const CATEGORY_ORDER: Category[] = ["safety", "health", "environment", "gas", "hazmat"];

export type Role = "안전관리자" | "보건관리자" | "환경기술인" | "가스안전관리자" | "위험물안전관리자" | "사업주·관리책임자";

/** 해당월 산정 방식 */
export type Cadence =
  | { kind: "monthly"; label: string } // 매월
  | { kind: "months"; months: number[]; label: string } // 분기·반기·연 1회 등 정해진 달
  | { kind: "multiyear"; years: number; label: string } // N년마다 — 기준(대상)월에서 산정
  | { kind: "event"; label: string } // 수시(발생 시) — 표에는 기록만
  | { kind: "auto"; label: string }; // 하위 시스템 데이터로 달 단위 판정(동적)

/** 자동판정 소스 */
export type AutoSource = "water" | "air" | "msds" | "risk" | "education";

export type TaskDef = {
  id: string;
  category: Category;
  role: Role;
  title: string;
  cadence: Cadence;
  basis: string; // 법적 근거
  penalty: string; // 과태료·벌칙
  note?: string;
  auto?: AutoSource;
  link?: string; // 자동판정 업무에서 "열기 →"로 이동할 하위 시스템 주소
  defaultEnabled: boolean; // 기본 해당 여부 (사업장에 없는 업무는 해당없음으로 끌 수 있음)
};

/** 사용자가 업무별로 보정한 설정 */
export type TaskSettings = {
  enabled?: boolean; // false면 해당없음
  months?: number[]; // cadence.kind === "months"일 때 해당월 보정
  anchor?: { year: number; month: number }; // multiyear 대상월
  verified?: boolean; // 법령 근거를 사용자가 확인함
};

export type SettingsMap = Record<string, TaskSettings>;

export type RecordFile = { name: string; path: string };

/** 완료 기록 — 업무×연×월 */
export type TaskRecord = {
  id: string;
  taskId: string;
  year: number;
  month: number;
  status: "done" | "na"; // 완료 | 이 달은 해당없음
  doneDate: string | null; // YYYY-MM-DD
  by: string;
  note: string;
  files: RecordFile[];
  at: string; // 기록 시각 ISO
};

export type CellStatus = "none" | "na" | "done" | "due" | "overdue" | "anchor";

/** 하위 시스템에서 읽어온 자동판정 결과 */
export type AutoResult = {
  cells: Record<number, "done" | "due">; // 월 → 판정 (없는 달은 해당월 아님)
  note?: string;
  error?: string;
};
