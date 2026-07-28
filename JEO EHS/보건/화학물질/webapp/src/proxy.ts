import { NextRequest, NextResponse } from "next/server";
import { PLACEMENT_EXAM_AUTH_COOKIE, expectedAuthToken } from "@/lib/auth/placementExamAuth";

const PUBLIC_PATHS = ["/placement-exam/login", "/api/placement-exam/auth"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get(PLACEMENT_EXAM_AUTH_COOKIE)?.value;
  const expected = await expectedAuthToken();

  if (expected && cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const loginUrl = new URL("/placement-exam/login", req.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/placement-exam/:path*", "/api/placement-exam/:path*"],
};
