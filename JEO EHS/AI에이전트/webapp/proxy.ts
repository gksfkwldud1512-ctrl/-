import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { withBase } from "@/lib/base";

// 1차 관문: 로그인하지 않았으면 화면은 /login으로, API는 401로 돌려보낸다.
// (권한 검증은 각 API 라우트가 서버에서 다시 한다 — 프록시만 믿지 않는다.)
const PUBLIC = ["/login", "/api/auth/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();

  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "UNAUTHENTICATED", message: "로그인이 필요합니다." }, { status: 401 });
  // 포털 주소 아래로 프록시되어도 포털 도메인을 벗어나지 않도록 "상대 경로"로 이동시킨다.
  return new NextResponse(null, { status: 307, headers: { Location: withBase("/login") } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
