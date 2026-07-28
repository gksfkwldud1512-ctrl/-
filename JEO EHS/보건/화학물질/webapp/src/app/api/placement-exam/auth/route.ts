import { NextResponse } from "next/server";
import { PLACEMENT_EXAM_AUTH_COOKIE, sha256Hex } from "@/lib/auth/placementExamAuth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const expected = process.env.PLACEMENT_EXAM_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const token = await sha256Hex(expected);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PLACEMENT_EXAM_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none", // 포털 페이지의 iframe 안에서 열려도 쿠키가 전달되도록
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PLACEMENT_EXAM_AUTH_COOKIE);
  return res;
}
