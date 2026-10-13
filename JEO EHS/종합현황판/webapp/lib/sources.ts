import type { AutoResult, Category, Role, TaskDef } from "./types";
import type { Today } from "./taskStatus";

// 하위 시스템 주소 — 서버(Next)에서 직접 불러오므로 CORS가 필요 없다.
export const SYSTEM_URL = {
  daegi: "https://daegi-bangji-webapp.vercel.app",
  chemical: "https://webapp-one-eta-66.vercel.app",
  jungcheo: "https://jungcheobub-webapp.vercel.app",
} as const;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

const errorResult = (what: string, e: unknown): AutoResult => ({
  cells: {},
  error: `${what} 데이터를 불러오지 못했습니다 (${e instanceof Error ? e.message : "오류"})`,
});

type DaegiStatus = {
  water: { months: number[]; lastDate: string | null; partialUntil: string | null; manifestCount: number };
  air: { bothMonths: number[]; gongdongMonths: number[]; unjeonMonths: number[] };
};

function allMonths(done: Set<number>): AutoResult["cells"] {
  const cells: AutoResult["cells"] = {};
  for (let m = 1; m <= 12; m++) cells[m] = done.has(m) ? "done" : "due";
  return cells;
}

type EducationItem = { id: string; name: string; target: string; cycleMonths: number; lastDate: string | null };

export type AutoBundle = {
  autoByTask: Record<string, AutoResult>;
  dynamicTasks: TaskDef[];
};

/** 하위 시스템 데이터로 자동판정 결과와 동적 업무(법정교육 항목별 행)를 만든다. */
export async function loadAutoBundle(year: number, today: Today): Promise<AutoBundle> {
  const autoByTask: Record<string, AutoResult> = {};
  const dynamicTasks: TaskDef[] = [];

  const [daegi, chem, risk, edu] = await Promise.allSettled([
    fetchJson<DaegiStatus>(`${SYSTEM_URL.daegi}/api/status?year=${year}`),
    fetchJson<{ total: number; needsCheck: number; noDate: number; ok: number; needsCheckNames: string[] }>(`${SYSTEM_URL.chemical}/api/status`),
    fetchJson<{ records: { date: string; status: string }[]; targets: { year: string; half: string; targetCount: number }[] }>(
      `${SYSTEM_URL.jungcheo}/api/compliance/risk-assessment`
    ),
    fetchJson<{ items: EducationItem[] }>(`${SYSTEM_URL.jungcheo}/api/education`),
  ]);

  // 폐수일지 / 대기운용기록부
  if (daegi.status === "fulfilled") {
    const w = daegi.value.water;
    autoByTask["env-water-log"] = {
      cells: allMonths(new Set(w.months)),
      note: w.lastDate ? `위탁인계 ${w.manifestCount}건 · 일지 작성 ~${w.lastDate}` : "위탁인계서 미업로드",
    };
    autoByTask["env-air-log"] = {
      cells: allMonths(new Set(daegi.value.air.bothMonths)),
      note: `엑셀 2종 모두 다운로드한 달: ${daegi.value.air.bothMonths.join(", ") || "없음"}`,
    };
  } else {
    autoByTask["env-water-log"] = errorResult("폐수일지", daegi.reason);
    autoByTask["env-air-log"] = errorResult("대기운용기록부", daegi.reason);
  }

  // MSDS 개정확인 — 현재 상태 기반(과거 이력 없음): 이번 달에만 해당/완료로 표시
  if (chem.status === "fulfilled") {
    const c = chem.value;
    const cells: AutoResult["cells"] = {};
    if (year === today.year) cells[today.month] = c.needsCheck > 0 ? "due" : "done";
    autoByTask["health-msds-revision"] = {
      cells,
      note: c.needsCheck > 0 ? `재개정확인필요 ${c.needsCheck}건 · 개정일없음 ${c.noDate}건 (전체 ${c.total}건)` : `재개정확인필요 0건 · 개정일없음 ${c.noDate}건`,
    };
  } else {
    autoByTask["health-msds-revision"] = errorResult("MSDS", chem.reason);
  }

  // 위험성평가 — 반기(6월·12월 칸)별로 완료된 평가 기록이 1건 이상이면 완료
  if (risk.status === "fulfilled") {
    const doneIn = (from: number, to: number) =>
      risk.value.records.some((r) => {
        if (r.status !== "완료") return false;
        const [y, m] = r.date.split("-").map(Number);
        return y === year && m >= from && m <= to;
      });
    autoByTask["safety-risk-assessment"] = {
      cells: { 6: doneIn(1, 6) ? "done" : "due", 12: doneIn(7, 12) ? "done" : "due" },
      note: `상반기 완료 ${doneIn(1, 6) ? "있음" : "없음"} · 하반기 완료 ${doneIn(7, 12) ? "있음" : "없음"}`,
    };
  } else {
    autoByTask["safety-risk-assessment"] = errorResult("위험성평가", risk.reason);
  }

  // 법정교육관리 — 중처법 앱의 교육 항목마다 한 줄씩
  if (edu.status === "fulfilled") {
    for (const it of edu.value.items) {
      const id = `edu:${it.id}`;
      const { category, role } = educationPlacement(it.name);
      dynamicTasks.push({
        id,
        category,
        role,
        title: `법정교육: ${it.name}`,
        cadence: { kind: "auto", label: cycleLabel(it.cycleMonths) },
        basis: `법정교육관리(중처법 이행관리 앱) — 대상: ${it.target || "미입력"}`,
        penalty: "교육 미실시 시 과태료·중대재해 시 책임 가중 (교육 종류별 확인필요)",
        auto: "education",
        link: SYSTEM_URL.jungcheo,
        defaultEnabled: true,
      });
      autoByTask[id] = educationCells(it, year, today);
    }
  } else {
    autoByTask["edu:error"] = errorResult("법정교육", edu.reason);
  }

  return { autoByTask, dynamicTasks };
}

/** 법정교육 항목을 이름으로 분야(안전/보건/환경/가스/위험물)와 담당에 배치한다. */
function educationPlacement(name: string): { category: Category; role: Role } {
  if (/환경기술인|폐기물|대기|수질/.test(name)) return { category: "environment", role: "환경기술인" };
  if (/위험물/.test(name)) return { category: "hazmat", role: "위험물안전관리자" };
  if (/가스|보일러/.test(name)) return { category: "gas", role: "가스안전관리자" };
  if (/보건/.test(name)) return { category: "health", role: "보건관리자" };
  if (/관리책임자|대표/.test(name)) return { category: "safety", role: "사업주·관리책임자" };
  return { category: "safety", role: "안전관리자" }; // 안전관리자·소방안전관리자 등
}

function cycleLabel(months: number): string {
  if (months === 1) return "매월";
  if (months === 3) return "분기";
  if (months === 6) return "반기";
  if (months === 12) return "매년";
  return `${months}개월마다`;
}

/** 교육기한 = 최근교육일 + 주기. 실시한 달은 완료, 기한 달은 해당(지나면 미실시)로 표시한다. */
function educationCells(it: EducationItem, year: number, today: Today): AutoResult {
  const cells: AutoResult["cells"] = {};
  if (!it.lastDate) {
    if (year === today.year) cells[today.month] = "due";
    return { cells, note: "최근교육일 미입력 — 중처법 이행관리 앱에서 입력하세요" };
  }
  const last = new Date(it.lastDate);
  if (Number.isNaN(last.getTime())) return { cells, error: "최근교육일 형식 오류" };
  if (last.getFullYear() === year) cells[last.getMonth() + 1] = "done";

  const due = new Date(last);
  due.setMonth(due.getMonth() + it.cycleMonths);
  if (due.getFullYear() === year) {
    const m = due.getMonth() + 1;
    if (!cells[m]) cells[m] = "due";
  } else if (due.getFullYear() < today.year && year === today.year && due < new Date(today.year, today.month - 1, 1)) {
    cells[1] = "due"; // 기한이 이미 지난 해에 끝난 항목 — 올해 1월부터 미실시로 표시
  }
  const ymd = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
  return { cells, note: `최근교육일 ${it.lastDate} · 다음 교육기한 ${ymd}` };
}
