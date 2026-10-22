import { beforeEach } from "vitest";
import { hashPassword, resetLoginLocks } from "@/lib/auth/users";
import { resetStore } from "@/lib/store";

process.env.CC_SESSION_SECRET = "test-secret-test-secret-test-secret-0123456789";
process.env.CC_USERS = JSON.stringify([
  { id: "officer", name: "김EHS", role: "ehs_officer", hash: hashPassword("officer-pass") },
  { id: "officer2", name: "박EHS", role: "ehs_officer", hash: hashPassword("officer2-pass") },
  { id: "viewer", name: "조회자", role: "viewer", hash: hashPassword("viewer-pass") },
  { id: "admin", name: "관리자", role: "admin", hash: hashPassword("admin-pass") },
]);

beforeEach(() => {
  resetStore();
  resetLoginLocks();
});
