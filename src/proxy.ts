import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 미국 캘리포니아·뉴욕은 가입·이용을 막는다(decisions "법률 검토"). Vercel 지오 헤더 기준이며 로컬에서는 헤더가 없어 통과한다.
const BLOCKED_US_REGIONS = new Set(["CA", "NY"]);

export function proxy(request: NextRequest) {
  const country = request.headers.get("x-vercel-ip-country");
  const region = request.headers.get("x-vercel-ip-country-region");
  if (country === "US" && region && BLOCKED_US_REGIONS.has(region)) {
    return NextResponse.redirect(new URL("/geo-block", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!geo-block|_next/|manifest\\.webmanifest|favicon\\.ico).*)"],
};
