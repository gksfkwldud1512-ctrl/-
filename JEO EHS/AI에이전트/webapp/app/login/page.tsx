"use client";

import { useState } from "react";
import { withBase } from "@/lib/base";

export default function LoginPage() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(withBase("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id.trim(), password }),
      });
      if (res.ok) {
        window.location.href = withBase("/");
        return;
      }
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(j?.message ?? "로그인에 실패했습니다.");
    } catch {
      setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cc-bg px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-cc-line bg-cc-panel p-6 shadow-[0_8px_40px_rgba(31,111,208,0.12)]">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-cc-card text-3xl ring-2 ring-cc-cyan/40" aria-hidden>🤖</div>
          <h1 className="text-lg font-bold text-white">JEO AI 관제센터</h1>
          <p className="text-xs text-sky-300">승인된 사용자만 접속할 수 있습니다</p>
        </div>
        <label className="mb-3 block text-sm text-sky-100">
          아이디
          <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required
            className="mt-1 w-full rounded-lg border border-cc-line bg-cc-bg px-3 py-2 text-cc-text outline-none focus:border-cc-cyan" />
        </label>
        <label className="mb-4 block text-sm text-sky-100">
          비밀번호
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required
            className="mt-1 w-full rounded-lg border border-cc-line bg-cc-bg px-3 py-2 text-cc-text outline-none focus:border-cc-cyan" />
        </label>
        {error && <p role="alert" className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-cc-blue py-2 font-medium text-[#fff] hover:bg-[#2a7fe0] disabled:opacity-60">
          {busy ? "확인 중..." : "로그인"}
        </button>
      </form>
    </main>
  );
}
