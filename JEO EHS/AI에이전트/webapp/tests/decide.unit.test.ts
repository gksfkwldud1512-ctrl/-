import { describe, expect, it } from "vitest";
import { decide } from "@/lib/approval/decide";
import { getStore } from "@/lib/store";
import { newKey } from "./helpers";

const body = (over = {}) => ({ approvalId: "a-1", action: "approve", reason: "확인 완료했습니다", expectedVersion: 1, evidenceVersion: "ev-1", idempotencyKey: newKey(), ...over });

describe("decide() 자체 권한 검사(라우트 가드와 별개로 이중 방어)", () => {
  it("viewer/admin 사용자 객체로 직접 호출해도 거부", () => {
    for (const role of ["viewer", "admin"] as const) {
      const r = decide(getStore(), { id: "u", name: "u", role }, body());
      expect(r).toMatchObject({ ok: false, status: 403, code: "FORBIDDEN" });
    }
    expect(getStore().getApproval("a-1")!.status).toBe("pending");
  });
  it("ehs_officer는 통과", () => {
    expect(decide(getStore(), { id: "o", name: "o", role: "ehs_officer" }, body()).ok).toBe(true);
  });
});
