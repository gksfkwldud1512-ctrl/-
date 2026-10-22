import { createHash } from "node:crypto";
import type { Approval, Artifact, Check, RunEvent, Verification } from "./types";

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * 최종 검증 — 승인(approve)하기 직전에 서버가 다시 계산한다. 화면에 보인 결과를 믿지 않는다.
 *  1) QA 통과  2) 실행 이벤트 누락 없음  3) 결과물 무결성(해시 재계산)
 */
export function finalVerify(approval: Approval, events: RunEvent[], artifacts: Artifact[]): Verification {
  const checks: Check[] = [];

  checks.push({
    id: "qa",
    label: "QA 검증 통과",
    ok: approval.qaPassed,
    detail: approval.qaPassed ? approval.qaNote : `QA 미통과: ${approval.qaNote}`,
  });

  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const missing: number[] = [];
  for (let i = 1; i <= (sorted.at(-1)?.seq ?? 0); i++) if (!sorted.some((e) => e.seq === i)) missing.push(i);
  const hasStart = sorted.some((e) => e.type === "run.started");
  const hasVerifyReq = sorted.some((e) => e.type === "verification.requested");
  const failed = sorted.some((e) => e.type === "run.failed");
  const eventsOk = sorted.length > 0 && missing.length === 0 && hasStart && hasVerifyReq && !failed;
  checks.push({
    id: "events",
    label: "실행 이벤트 누락 없음",
    ok: eventsOk,
    detail: eventsOk
      ? `이벤트 ${sorted.length}건 연속`
      : [
          sorted.length === 0 ? "이벤트 없음" : "",
          missing.length ? `누락된 순번 ${missing.join(", ")}` : "",
          !hasStart ? "시작 이벤트 없음" : "",
          !hasVerifyReq ? "검증요청 이벤트 없음" : "",
          failed ? "실행 실패 기록 있음" : "",
        ].filter(Boolean).join(" · "),
  });

  const bad = artifacts.filter((a) => sha256(a.content) !== a.sha256 || Buffer.byteLength(a.content, "utf8") !== a.sizeBytes);
  const missingArt = approval.artifactIds.filter((id) => !artifacts.some((a) => a.id === id));
  const artOk = bad.length === 0 && missingArt.length === 0 && artifacts.length > 0;
  checks.push({
    id: "artifacts",
    label: "결과물 무결성(해시 일치)",
    ok: artOk,
    detail: artOk
      ? `결과물 ${artifacts.length}건 해시 일치`
      : [artifacts.length === 0 ? "결과물 없음" : "", bad.length ? `변조 의심 ${bad.map((a) => a.name).join(", ")}` : "", missingArt.length ? `누락 ${missingArt.join(", ")}` : ""].filter(Boolean).join(" · "),
  });

  return { ok: checks.every((c) => c.ok), checks };
}
