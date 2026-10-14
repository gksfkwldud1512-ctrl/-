import { describe, expect, it } from "vitest";
import { POST as decisionPost } from "@/app/api/approvals/[id]/decision/route";
import { GET as approvalsGet } from "@/app/api/approvals/route";
import { GET as auditGet } from "@/app/api/audit/route";
import { GET as artifactGet } from "@/app/api/artifacts/[id]/route";
import { getStore } from "@/lib/store";
import { verifyAuditChain } from "@/lib/store/memory";
import { adminCookie, ctx, decisionBody, newKey, officer2Cookie, officerCookie, req, viewerCookie } from "./helpers";

const decide = (id: string, cookie: string | undefined, body: unknown) =>
  decisionPost(req(`/api/approvals/${id}/decision`, { method: "POST", cookie, body }), ctx(id));

describe("1. 권한 없는 승인 요청", () => {
  it("로그인 없이 승인 → 401, 감사 로그 denied", async () => {
    const res = await decide("a-1", undefined, decisionBody());
    expect(res.status).toBe(401);
    expect(getStore().getApproval("a-1")!.status).toBe("pending");
    expect(getStore().listAudit().at(-1)).toMatchObject({ outcome: "denied", code: "UNAUTHENTICATED", role: "anonymous" });
  });
  it("조회 전용 사용자 → 403, 상태 불변, 감사 로그에 본인 ID", async () => {
    const res = await decide("a-1", await viewerCookie(), decisionBody());
    expect(res.status).toBe(403);
    expect(getStore().getApproval("a-1")!.status).toBe("pending");
    expect(getStore().listAudit().at(-1)).toMatchObject({ outcome: "denied", code: "FORBIDDEN", actorId: "viewer" });
  });
  it("관리자도 승인 불가(업무 분리)", async () => {
    expect((await decide("a-1", await adminCookie(), decisionBody())).status).toBe(403);
  });
  it("위조/변조된 쿠키는 거부", async () => {
    const good = await officerCookie();
    expect((await decide("a-1", good.slice(0, -3) + "AAA", decisionBody())).status).toBe(401);
    expect((await decide("a-1", "cc_session=garbage", decisionBody())).status).toBe(401);
  });
  it("EHS 담당자는 승인 가능", async () => {
    const res = await decide("a-1", await officerCookie(), decisionBody({ confirmLegal: undefined }));
    expect(res.status).toBe(200);
    expect(getStore().getApproval("a-1")!.status).toBe("approved");
  });
});

describe("2. 중복 승인", () => {
  it("이미 승인된 항목에 다른 요청키로 다시 승인 → 409, 승인 기록은 1건", async () => {
    const c = await officerCookie();
    expect((await decide("a-3", c, decisionBody({ evidenceVersion: "ev-2" }))).status).toBe(200);
    const second = await decide("a-3", await officer2Cookie(), decisionBody({ evidenceVersion: "ev-2", expectedVersion: 1 }));
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("ALREADY_DECIDED");
    expect(getStore().getApproval("a-3")!.history).toHaveLength(1);
    expect(getStore().listAudit().filter((e) => e.action === "approve" && e.outcome === "allowed")).toHaveLength(1);
  });
  it("승인 후 반려 시도도 막힘", async () => {
    const c = await officerCookie();
    await decide("a-1", c, decisionBody({ confirmLegal: undefined }));
    const res = await decide("a-1", c, decisionBody({ action: "reject" }));
    expect(res.status).toBe(409);
    expect(getStore().getApproval("a-1")!.status).toBe("approved");
  });
});

describe("3. 동시 수정", () => {
  it("동시에 승인/반려 → 정확히 하나만 성공", async () => {
    const [c1, c2] = [await officerCookie(), await officer2Cookie()];
    const results = await Promise.all([
      decide("a-1", c1, decisionBody({ confirmLegal: undefined })),
      decide("a-1", c2, decisionBody({ action: "reject" })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(getStore().getApproval("a-1")!.history).toHaveLength(1);
  });
  it("담당자가 보는 사이 에이전트가 근거를 바꾸면 → STALE/VERSION 충돌", async () => {
    const c = await officerCookie();
    getStore().resubmit("a-1", { draft: "수정된 초안", evidenceVersion: "ev-2" }); // 에이전트의 재제출
    const res = await decide("a-1", c, decisionBody({ confirmLegal: undefined })); // 담당자는 v1/ev-1을 본 상태
    expect(res.status).toBe(409);
    expect(["VERSION_CONFLICT", "STALE_EVIDENCE"]).toContain((await res.json()).error);
    expect(getStore().getApproval("a-1")!.status).toBe("pending");
  });
  it("버전은 맞지만 근거 버전이 다르면 STALE_EVIDENCE", async () => {
    const c = await officerCookie();
    const res = await decide("a-1", c, decisionBody({ confirmLegal: undefined, evidenceVersion: "ev-0" }));
    expect((await res.json()).error).toBe("STALE_EVIDENCE");
  });
});

describe("4. 네트워크 오류 후 재시도", () => {
  it("같은 요청키 재전송 → replay, 승인·감사 기록 중복 없음", async () => {
    const c = await officerCookie();
    const body = decisionBody({ confirmLegal: undefined });
    const first = await decide("a-1", c, body);
    expect(first.status).toBe(200);
    const retry = await decide("a-1", c, body); // 응답을 못 받아 같은 요청을 다시 보낸 상황
    expect(retry.status).toBe(200);
    expect((await retry.json()).replay).toBe(true);
    expect(getStore().getApproval("a-1")!.history).toHaveLength(1);
    expect(getStore().listAudit().filter((e) => e.action === "approve" && e.outcome === "allowed")).toHaveLength(1);
  });
  it("재전송이 동시에 여러 번 와도 1건만 반영", async () => {
    const c = await officerCookie();
    const body = decisionBody({ confirmLegal: undefined });
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => decide("a-1", c, body)));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(getStore().getApproval("a-1")!.history).toHaveLength(1);
  });
  it("다른 사람이 같은 키를 써도 재사용되지 않음", async () => {
    const key = newKey();
    await decide("a-1", await officerCookie(), decisionBody({ confirmLegal: undefined, idempotencyKey: key }));
    const other = await decide("a-1", await officer2Cookie(), decisionBody({ confirmLegal: undefined, idempotencyKey: key }));
    expect(other.status).toBe(409); // replay로 위장되지 않고 이미 처리됨으로 거부
  });
});

describe("5. 이벤트 누락 / 최종 검증", () => {
  it("이벤트 순번이 빠진 항목은 승인 불가(422) — 반려는 가능", async () => {
    const c = await officerCookie();
    const res = await decide("a-4", c, decisionBody());
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.error).toBe("VERIFICATION_FAILED");
    expect(j.verification.checks.find((x: { id: string }) => x.id === "events").ok).toBe(false);
    expect(getStore().getApproval("a-4")!.status).toBe("pending");
    expect((await decide("a-4", c, decisionBody({ action: "reject", reason: "이벤트 누락으로 반려" }))).status).toBe(200);
  });
  it("QA 미통과 항목은 승인 불가", async () => {
    expect((await decide("a-2", await officerCookie(), decisionBody())).status).toBe(422);
  });
  it("승인 직전에 이벤트가 사라지면(서버 재검증) 차단", async () => {
    getStore()._dropEventForTest("run-203", 2);
    expect((await decide("a-3", await officerCookie(), decisionBody({ evidenceVersion: "ev-2" }))).status).toBe(422);
  });
  it("결과물이 변조되면 승인 차단 + 열람 거부", async () => {
    getStore()._tamperArtifactForTest("art-3", "변조된 내용");
    expect((await decide("a-3", await officerCookie(), decisionBody({ evidenceVersion: "ev-2" }))).status).toBe(422);
    const r = await artifactGet(req("/api/artifacts/art-3", { cookie: await officerCookie() }), ctx("art-3"));
    expect(r.status).toBe(409);
  });
});

describe("6. 결과물 접근 권한", () => {
  it("로그인 없이 → 401", async () => {
    expect((await artifactGet(req("/api/artifacts/art-3"), ctx("art-3"))).status).toBe(401);
  });
  it("조회 전용: 제한 결과물 403, 일반 결과물 200", async () => {
    const c = await viewerCookie();
    expect((await artifactGet(req("/api/artifacts/art-3", { cookie: c }), ctx("art-3"))).status).toBe(403);
    expect((await artifactGet(req("/api/artifacts/art-1", { cookie: c }), ctx("art-1"))).status).toBe(200);
  });
  it("EHS 담당자·관리자는 제한 결과물 열람 가능, 열람이 감사 로그에 남음", async () => {
    for (const c of [await officerCookie(), await adminCookie()]) {
      const r = await artifactGet(req("/api/artifacts/art-3", { cookie: c }), ctx("art-3"));
      expect(r.status).toBe(200);
      expect((await r.json()).content).toContain("DEMO");
    }
    expect(getStore().listAudit().filter((e) => e.action === "artifact.read" && e.outcome === "allowed")).toHaveLength(2);
  });
  it("조회 전용 목록에서는 제한 항목의 초안·근거가 가려지고 검증 결과도 숨겨짐", async () => {
    const res = await approvalsGet(req("/api/approvals", { cookie: await viewerCookie() }));
    const { approvals } = await res.json();
    const legal = approvals.find((a: { id: string }) => a.id === "a-3");
    expect(legal.redacted).toBe(true);
    expect(legal.draft).toBeNull();
    expect(legal.evidence).toBeNull();
    expect(legal.verification).toBeNull();
    expect(legal.canDecide).toBe(false);
    expect(JSON.stringify(approvals)).not.toContain("관할 기관 제출 보고서 초안.txt");
  });
  it("존재하지 않는 결과물은 404", async () => {
    expect((await artifactGet(req("/api/artifacts/nope", { cookie: await officerCookie() }), ctx("nope"))).status).toBe(404);
  });
});

describe("7. 승인·반려·재검토와 감사 로그", () => {
  it("승인: 시각·담당자·근거 버전·사유가 기록됨", async () => {
    await decide("a-3", await officerCookie(), decisionBody({ evidenceVersion: "ev-2", reason: "제출 전 최종 확인 완료" }));
    const e = getStore().listAudit().findLast((x) => x.action === "approve")!;
    expect(e).toMatchObject({ actorId: "officer", actorName: "김EHS", role: "ehs_officer", outcome: "allowed", evidenceVersion: "ev-2", reason: "제출 전 최종 확인 완료", approvalVersion: 1, targetId: "a-3" });
    expect(Date.parse(e.at)).not.toBeNaN();
    const d = getStore().getApproval("a-3")!.decision!;
    expect(d).toMatchObject({ byId: "officer", evidenceVersion: "ev-2", reason: "제출 전 최종 확인 완료" });
  });
  it("반려와 재검토 요청", async () => {
    const c = await officerCookie();
    expect((await decide("a-1", c, decisionBody({ action: "reject", reason: "근거가 부족합니다" }))).status).toBe(200);
    expect(getStore().getApproval("a-1")!.status).toBe("rejected");
    expect((await decide("a-2", c, decisionBody({ action: "request_review", reason: "일지 대조 후 다시 제출" }))).status).toBe(200);
    expect(getStore().getApproval("a-2")!.status).toBe("review_requested");
  });
  it("재검토 요청 후 재제출하면 새 근거 버전으로 다시 pending", async () => {
    await decide("a-1", await officerCookie(), decisionBody({ action: "request_review", reason: "근거 보완 필요" }));
    const re = getStore().resubmit("a-1", { draft: "보완", evidenceVersion: "ev-2" })!;
    expect(re.status).toBe("pending");
    expect(re.version).toBe(3);
  });
  it("사유 없음/너무 짧음/잘못된 action/법적 승인 확인 누락은 400", async () => {
    const c = await officerCookie();
    for (const [over, code] of [
      [{ reason: "" }, "INVALID_REASON"], [{ reason: "네" }, "INVALID_REASON"], [{ reason: "가".repeat(501) }, "INVALID_REASON"],
      [{ action: "delete" }, "INVALID_ACTION"], [{ idempotencyKey: "x" }, "INVALID_IDEMPOTENCY_KEY"], [{ expectedVersion: "1" }, "INVALID_VERSION"],
    ] as [Record<string, unknown>, string][]) {
      const res = await decide("a-1", c, decisionBody(over));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(code);
    }
    const noConfirm = await decide("a-3", c, decisionBody({ evidenceVersion: "ev-2", confirmLegal: false }));
    expect((await noConfirm.json()).error).toBe("CONFIRMATION_REQUIRED");
    expect(getStore().getApproval("a-3")!.status).toBe("pending");
  });
  it("감사 로그는 해시 체인으로 이어지고, 변조·삭제를 탐지", async () => {
    const c = await officerCookie();
    await decide("a-1", c, decisionBody({ confirmLegal: undefined }));
    await decide("a-1", c, decisionBody()); // 충돌 기록
    const entries = getStore().listAudit();
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(verifyAuditChain(entries)).toEqual({ ok: true });
    getStore()._tamperAuditForTest(0, { reason: "조작" });
    expect(verifyAuditChain(getStore().listAudit()).ok).toBe(false);
  });
  it("감사 로그 조회 API: 조회 전용 403, 담당자 200 + 체인 정상", async () => {
    expect((await auditGet(req("/api/audit", { cookie: await viewerCookie() }))).status).toBe(403);
    const res = await auditGet(req("/api/audit", { cookie: await officerCookie() }));
    expect(res.status).toBe(200);
    expect((await res.json()).chain.ok).toBe(true);
  });
  it("감사 로그에 비밀번호·쿠키가 남지 않음", async () => {
    await viewerCookie();
    await decide("a-1", await viewerCookie(), decisionBody());
    const dump = JSON.stringify(getStore().listAudit());
    expect(dump).not.toContain("viewer-pass");
    expect(dump).not.toContain("cc_session");
  });
});
