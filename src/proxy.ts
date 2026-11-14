import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// 미국 캘리포니아·뉴욕은 가입·이용을 막는다(decisions "법률 검토"). Vercel 지오 헤더 기준이며 로컬에서는 헤더가 없어 통과한다.
const BLOCKED_US_REGIONS = new Set(["CA", "NY"]);

// Clerk 세션을 모든 요청에 붙인다(보호는 페이지가 getCurrentUser()로 한다).
export const proxy = clerkMiddleware((_auth, request) => {
  const country = request.headers.get("x-vercel-ip-country");
  const region = request.headers.get("x-vercel-ip-country-region");
  if (country === "US" && region && BLOCKED_US_REGIONS.has(region)) {
    return NextResponse.redirect(new URL("/geo-block", request.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!geo-block|_next/|manifest\\.webmanifest|favicon\\.ico).*)"],
};
