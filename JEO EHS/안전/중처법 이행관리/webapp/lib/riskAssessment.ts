import { put, get } from "@vercel/blob";
import type { EvidenceFile } from "./complianceData";

// 4-3(유해·위험요인 확인 및 개선 절차 — 위험성평가) 전용 데이터 모델. 나머지 12개 항목의 범용
// 체크리스트(lib/complianceData.ts)와 별도로 관리한다 — 위험성평가는 "체크박스로 완료 표시"가 아니라
// 반기별 목표/실적 건수와 실제 실시 목록(공정·평가자·위험요인·개선조치)을 추적하는 게 실무에 맞다.
export type RiskAssessmentRecord = {
  id: string;
  date: string; // YYYY-MM-DD
  process: string; // 공정명
  assessor: string; // 평가자
  hazard: string; // 발견된 위험요인
  riskLevel: "상" | "중" | "하";
  improvement: string; // 개선조치
  status: "계획" | "진행중" | "완료";
  evidenceFiles: EvidenceFile[]; // 위험성평가표 등 증빙(선택)
};

export type SemiAnnualTarget = {
  id: string; // `${year}-${half}`
  year: string; // "2026"
  half: "상반기" | "하반기";
  targetCount: number;
  note: string;
};

export type RiskAssessmentData = {
  updatedAt: string;
  records: RiskAssessmentRecord[];
  targets: SemiAnnualTarget[];
};

export type SemiAnnualSummary = {
  id: string;
  year: string;
  half: "상반기" | "하반기";
  targetCount: number;
  actualCount: number;
  achievedPct: number | null; // targetCount가 0이면 null
};

export type ProcessSummary = {
  process: string;
  count: number;
  completedCount: number;
  latestDate: string | null;
};

const DATA_PATH = "compliance/risk-assessment.json";

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function loadRiskAssessmentData(): Promise<RiskAssessmentData> {
  try {
    const result = await get(DATA_PATH, { access: "private", useCache: false });
    if (!result || !result.stream) return { updatedAt: "", records: [], targets: [] };
    const text = (await streamToBuffer(result.stream as ReadableStream<Uint8Array>)).toString("utf-8");
    const parsed = JSON.parse(text) as RiskAssessmentData;
    if (!parsed.records) parsed.records = [];
    if (!parsed.targets) parsed.targets = [];
    return parsed;
  } catch {
    return { updatedAt: "", records: [], targets: [] };
  }
}

export async function saveRiskAssessmentData(records: RiskAssessmentRecord[], targets: SemiAnnualTarget[]): Promise<RiskAssessmentData> {
  const next: RiskAssessmentData = { updatedAt: new Date().toISOString(), records, targets };
  await put(DATA_PATH, JSON.stringify(next), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return next;
}

/** 날짜 문자열로부터 역년 기준 상반기(1~6월)/하반기(7~12월)를 판정한다. */
export function halfOfDate(dateStr: string): { year: string; half: "상반기" | "하반기" } {
  const d = new Date(dateStr);
  const year = String(d.getFullYear());
  const half = d.getMonth() + 1 <= 6 ? "상반기" : "하반기";
  return { year, half };
}

/** 목표(targets)와 실제 실시 목록(records)을 연도·반기 기준으로 합쳐 반기별 실적표를 만든다. */
export function computeSemiAnnualSummary(data: RiskAssessmentData): SemiAnnualSummary[] {
  const countByKey = new Map<string, number>();
  for (const r of data.records) {
    const { year, half } = halfOfDate(r.date);
    const key = `${year}-${half}`;
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }

  const keys = new Set<string>([...data.targets.map((t) => t.id), ...countByKey.keys()]);
  const summaries: SemiAnnualSummary[] = [...keys].map((key) => {
    const target = data.targets.find((t) => t.id === key);
    const [year, half] = key.split("-") as [string, "상반기" | "하반기"];
    const actualCount = countByKey.get(key) ?? 0;
    const targetCount = target?.targetCount ?? 0;
    const achievedPct = targetCount > 0 ? Math.round((actualCount / targetCount) * 1000) / 10 : null;
    return { id: key, year, half, targetCount, actualCount, achievedPct };
  });

  return summaries.sort((a, b) => (a.year === b.year ? (a.half === b.half ? 0 : a.half === "상반기" ? -1 : 1) : b.year.localeCompare(a.year)));
}

/** 공정별로 실시 건수·완료 건수·최근 실시일을 집계한다. */
export function computeProcessSummary(data: RiskAssessmentData): ProcessSummary[] {
  const byProcess = new Map<string, ProcessSummary>();
  for (const r of data.records) {
    const p = r.process.trim() || "(미지정)";
    const existing = byProcess.get(p) ?? { process: p, count: 0, completedCount: 0, latestDate: null };
    existing.count += 1;
    if (r.status === "완료") existing.completedCount += 1;
    if (!existing.latestDate || r.date > existing.latestDate) existing.latestDate = r.date;
    byProcess.set(p, existing);
  }
  return [...byProcess.values()].sort((a, b) => b.count - a.count);
}

/** 4-3 항목의 이행율(도넛 차트용) — 목표가 설정된 반기들의 달성률(100% 상한) 평균. 목표 미설정 시 0. */
export function computeRiskAssessmentRate(data: RiskAssessmentData): number {
  const summaries = computeSemiAnnualSummary(data).filter((s) => s.targetCount > 0);
  if (summaries.length === 0) return 0;
  const sum = summaries.reduce((acc, s) => acc + Math.min(100, s.achievedPct ?? 0), 0);
  return Math.round((sum / summaries.length) * 10) / 10;
}
