import type { AgentState, Run } from "./types";

// ⚠️ 1단계 화면 확인용 샘플 데이터. 실제 실행 기록이 아니다(2단계에서 실데이터로 교체).
export const MOCK_AGENT_STATES: AgentState[] = [
  {
    id: "legal", status: "idle", headline: "대기 중 · 수동 실행",
    task: "요청이 들어오면 법령 개정 검토 초안을 만듭니다.", updatedAt: "09:50", nextRun: "수동 실행 시",
    outputs: ["산안법 시행규칙 개정 검토 초안 (어제)"],
  },
  {
    id: "safety", status: "completed", headline: "교육기한 임박 3건",
    task: "중처법 이행·법정교육 기한을 점검했습니다.", updatedAt: "10:02", nextRun: "매주 월요일 08:00 (예약)",
    outputs: ["교육기한 임박 3건 목록", "반기점검 기한 경고 1건"],
  },
  {
    id: "environment", status: "failed", headline: "대기 데이터 불러오기 실패",
    task: "폐수·대기 일지 누락 여부를 점검하려 했습니다.", updatedAt: "09:00", nextRun: "매월 1일 09:00 (예약) · 재실행 가능",
    outputs: [], error: "대기방지시설 /api/status 응답 없음(타임아웃 10초)",
  },
  {
    id: "report", status: "reviewing", headline: "QA 검토 중",
    task: "주간회의 개요 초안을 만들었고 QA의 검증을 기다립니다.", updatedAt: "10:03", nextRun: "매주 월요일 09:00 (예약)",
    outputs: ["주간회의 개요 초안 v1"],
  },
  {
    id: "action", status: "awaiting_approval", headline: "승인 3건 대기",
    task: "사람의 승인이 있어야 실행할 수 있는 조치 3건이 대기 중입니다.", updatedAt: "10:03", nextRun: "승인 직후 (이벤트)",
    outputs: ["현황판 메모 기록 3건 (승인 후)"],
  },
  {
    id: "qa", status: "running", headline: "초안 검증 중",
    task: "다른 담당자의 산출물을 원자료와 대조해 검증하고 있습니다.", updatedAt: "10:03", nextRun: "산출물 생성 시 (이벤트)",
    outputs: ["검증 통과 2건 · 확인 필요 1건"],
  },
];

export const MOCK_RUNS: Run[] = [
  {
    id: 128,
    workflow: "주간 EHS 점검",
    trigger: "schedule",
    startedAt: "10:02",
    durationSec: null,
    steps: [
      { agent: "safety", executor: "rule", status: "success" },
      { agent: "environment", executor: "rule", status: "success" },
      { agent: "report", executor: "rule", status: "success" },
      { agent: "qa", executor: "rule", status: "success" },
      { agent: "action", executor: "human", status: "waiting" },
    ],
  },
  {
    id: 127,
    workflow: "법령 검토",
    trigger: "manual",
    startedAt: "09:50",
    durationSec: 4,
    steps: [
      { agent: "legal", executor: "rule", status: "success" },
      { agent: "qa", executor: "rule", status: "success" },
    ],
  },
  {
    id: 126,
    workflow: "일지 누락 점검",
    trigger: "schedule",
    startedAt: "09:00",
    durationSec: 2,
    error: "대기방지시설 /api/status 응답 없음(타임아웃 10초)",
    steps: [{ agent: "environment", executor: "rule", status: "error" }],
  },
];
