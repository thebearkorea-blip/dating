// 앱 열기(app_open) 기록. /chat·/him·/me 서버 렌더에서 하루(사용자 시간대) 1회만.
// 프리페치·서비스워커 요청은 사용자가 연 것이 아니므로 기록하지 않는다.
import type { Db } from "../db/client";
import { safeTz } from "../product";
import { recordEvent } from "./events.js";

interface HeaderGetter {
  get(name: string): string | null;
}

/** Next <Link> 프리페치, RSC 프리페치, 브라우저 prefetch, 서비스워커 요청. */
export function isNonUserRequest(h: HeaderGetter): boolean {
  if (h.get("next-router-prefetch") || h.get("x-middleware-prefetch")) return true;
  for (const name of ["purpose", "sec-purpose"]) {
    if ((h.get(name) ?? "").toLowerCase().includes("prefetch")) return true;
  }
  const dest = (h.get("sec-fetch-dest") ?? "").toLowerCase();
  return dest === "serviceworker" || dest === "worker" || dest === "sharedworker";
}

export async function maybeRecordAppOpen(db: Db, user: { id: string; tz: string | null }, now: Date, h: HeaderGetter): Promise<boolean> {
  if (isNonUserRequest(h)) return false;
  return recordEvent(db, user.id, "app_open", { once: "day", now, tz: safeTz(user.tz) });
}
