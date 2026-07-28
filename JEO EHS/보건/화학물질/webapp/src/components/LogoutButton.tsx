"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/placement-exam/auth", { method: "DELETE" });
    router.push("/placement-exam/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="h-fit rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
    >
      로그아웃
    </button>
  );
}
