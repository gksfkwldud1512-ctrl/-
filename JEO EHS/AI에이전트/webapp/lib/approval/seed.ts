// ⚠️ DEMO 시드 데이터 — 실제 업무 기록이 아니다.
import { sha256 } from "./verify";
import type { Approval, Artifact, RunEvent } from "./types";

const at = "2026-10-14T01:00:00.000Z";

function art(id: string, runId: string, name: string, restricted: boolean, content: string): Artifact {
  return { id, runId, name, restricted, content, sha256: sha256(content), sizeBytes: Buffer.byteLength(content, "utf8") };
}

function events(runId: string, types: RunEvent["type"][], skipSeq: number[] = []): RunEvent[] {
  return types
    .map((type, i) => ({ eventId: `${runId}-e${i + 1}`, runId, seq: i + 1, type, actorType: "rule_engine" as const, at }))
    .filter((e) => !skipSeq.includes(e.seq));
}

const FULL: RunEvent["type"][] = ["run.started", "step.completed", "step.completed", "verification.requested"];

export function buildSeed(): { approvals: Approval[]; events: RunEvent[]; artifacts: Artifact[] } {
  const artifacts = [
    art("art-1", "run-201", "교육기한 임박 목록.txt", false, "[DEMO] 안전관리자 신규 채용 교육 — 기한 30일 이내 3건"),
    art("art-2", "run-202", "폐수 일지 점검표.txt", true, "[DEMO] 9월 위탁인계서 2건 중 일지 반영 1건. 법적 보관 의무 충족 여부 판정 초안."),
    art("art-3", "run-203", "관할 기관 제출 보고서 초안.txt", true, "[DEMO] 외부 제출용 초안 — 제출 전 EHS 담당자 확인 필요."),
    art("art-4", "run-204", "법정 의무 판정서.txt", true, "[DEMO] 법적 의무 판정 초안 — 근거 조항 3건 인용."),
  ];
  const base = { executor: "rule" as const, history: [], status: "pending" as const, version: 1, createdAt: at };
  const approvals: Approval[] = [
    {
      ...base, id: "a-1", title: "법정교육 기한 임박 알림 — 안전관리자 신규 채용 교육", kind: "internal_record",
      requestedBy: "safety", runId: "run-201", qaPassed: true, qaNote: "교육 항목·최근교육일·주기 3건 원자료와 일치",
      draft: "다음 교육기한이 30일 이내입니다. 대상자에게 교육 일정을 안내하세요.",
      evidence: ["중처법 이행관리 /api/education — 최근교육일·주기 필드"], evidenceVersion: "ev-1", artifactIds: ["art-1"],
      onApprove: "종합현황판에 '교육 안내 필요' 메모로 기록(외부 발송 없음)",
    },
    {
      ...base, id: "a-2", title: "폐수 일지 보관 의무 충족 판정", kind: "legal_determination",
      requestedBy: "environment", runId: "run-202", qaPassed: false, qaNote: "위탁인계서 건수가 일지와 1건 불일치 — 확인 필요",
      draft: "9월 위탁인계서 2건 중 일지 반영 1건. 누락분 확인 후 일지를 보완하세요.",
      evidence: ["대기방지시설 /api/status — water.manifestCount, lastDate"], evidenceVersion: "ev-1", artifactIds: ["art-2"],
      onApprove: "판정 결과를 현황판에 기록(외부 발송 없음)",
    },
    {
      ...base, id: "a-3", title: "관할 기관 제출 보고서 확정", kind: "external_submission",
      requestedBy: "report", runId: "run-203", qaPassed: true, qaNote: "항목 수·표기 검증 통과",
      draft: "신규 이슈 2건, 진행중 업무 5건 (중처법 반기점검 기한 포함)",
      evidence: ["현황판 완료기록", "중처법 이행관리 반기점검 기한"], evidenceVersion: "ev-2", artifactIds: ["art-3"],
      onApprove: "제출용 파일을 '승인됨'으로 표시(실제 제출은 사람이 직접 수행)",
    },
    {
      ...base, id: "a-4", title: "법적 의무 판정 — 이벤트 누락 사례", kind: "legal_determination",
      requestedBy: "safety", runId: "run-204", qaPassed: true, qaNote: "QA 통과",
      draft: "법적 의무 판정 초안. 단, 실행 기록 일부가 없습니다.",
      evidence: ["중처법 이행관리 /api/compliance"], evidenceVersion: "ev-1", artifactIds: ["art-4"],
      onApprove: "판정 결과를 현황판에 기록(외부 발송 없음)",
    },
  ];
  return {
    approvals,
    artifacts,
    events: [
      ...events("run-201", FULL), ...events("run-202", FULL), ...events("run-203", FULL),
      ...events("run-204", FULL, [3]), // 3번 이벤트 누락 → 최종 검증에서 승인 차단
    ],
  };
}
