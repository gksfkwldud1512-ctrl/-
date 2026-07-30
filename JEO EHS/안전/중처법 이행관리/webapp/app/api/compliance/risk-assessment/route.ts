import { NextResponse } from "next/server";
import {
  loadRiskAssessmentData,
  saveRiskAssessmentData,
  type RiskAssessmentRecord,
  type SemiAnnualTarget,
} from "@/lib/riskAssessment";
import type { EvidenceFile } from "@/lib/complianceData";

export async function GET() {
  const data = await loadRiskAssessmentData();
  return NextResponse.json(data);
}

function toEvidenceFile(v: unknown): EvidenceFile | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== "string" || typeof o.url !== "string" || typeof o.uploadedAt !== "string") return null;
  return { name: o.name, url: o.url, uploadedAt: o.uploadedAt };
}

const RISK_LEVELS = new Set(["상", "중", "하"]);
const STATUSES = new Set(["계획", "진행중", "완료"]);

function toRecord(v: unknown): RiskAssessmentRecord | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.date !== "string" || typeof o.process !== "string") return null;
  const evidenceFiles = Array.isArray(o.evidenceFiles) ? o.evidenceFiles.map(toEvidenceFile).filter((e): e is EvidenceFile => !!e) : [];
  return {
    id: o.id,
    date: o.date,
    process: o.process,
    assessor: typeof o.assessor === "string" ? o.assessor : "",
    hazard: typeof o.hazard === "string" ? o.hazard : "",
    riskLevel: RISK_LEVELS.has(o.riskLevel as string) ? (o.riskLevel as RiskAssessmentRecord["riskLevel"]) : "중",
    improvement: typeof o.improvement === "string" ? o.improvement : "",
    status: STATUSES.has(o.status as string) ? (o.status as RiskAssessmentRecord["status"]) : "계획",
    evidenceFiles,
  };
}

function toTarget(v: unknown): SemiAnnualTarget | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.year !== "string") return null;
  const half = o.half === "상반기" || o.half === "하반기" ? o.half : "상반기";
  const n = Number(o.targetCount);
  return {
    id: o.id,
    year: o.year,
    half,
    targetCount: Number.isFinite(n) && n >= 0 ? n : 0,
    note: typeof o.note === "string" ? o.note : "",
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const rawRecords = (body as { records?: unknown }).records;
  const rawTargets = (body as { targets?: unknown }).targets;
  if (!Array.isArray(rawRecords) || !Array.isArray(rawTargets)) {
    return NextResponse.json({ error: "records/targets 배열이 필요합니다." }, { status: 400 });
  }

  const records = rawRecords.map(toRecord).filter((r): r is RiskAssessmentRecord => !!r);
  const targets = rawTargets.map(toTarget).filter((t): t is SemiAnnualTarget => !!t);

  const saved = await saveRiskAssessmentData(records, targets);
  return NextResponse.json(saved);
}
