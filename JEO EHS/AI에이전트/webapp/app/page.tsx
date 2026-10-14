import { ControlCenter } from "@/components/ControlCenter";
import { MOCK_AGENT_STATES, MOCK_RUNS } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default function Page() {
  // 에이전트 상태·실행 기록은 아직 샘플(DEMO). 승인센터·감사 로그는 서버 API(/api/approvals, /api/audit)에서 가져온다.
  return <ControlCenter agentStates={MOCK_AGENT_STATES} runs={MOCK_RUNS} />;
}
