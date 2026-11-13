// 개발용 인증 스텁. 쿠키 dev_session(= personal.users.id)만 본다. 출시 금지.
// TODO(Clerk): 이 파일의 getCurrentUser()/signOut()을 Clerk(auth()·currentUser() → personal.users 매핑)로 교체한다.
// 호출자(페이지·Server Action)는 이 인터페이스만 쓴다. devLogin은 Clerk 전환 때 삭제한다.
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/index";
import { assertDevOnly } from "@/dev-only";

export const SESSION_COOKIE = "dev_session";
export type CurrentUser = typeof users.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id || !UUID.test(id)) return null;
  const [u] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

export async function devLogin(displayName: string): Promise<CurrentUser> {
  "use server";
  assertDevOnly("dev-login");
  const name = displayName.trim().slice(0, 40) || "dev";
  const [u] = await getDb().insert(users).values({ displayName: name }).returning();
  if (!u) throw new Error("user insert failed");
  (await cookies()).set(SESSION_COOKIE, u.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return u;
}

export async function signOut(): Promise<void> {
  "use server";
  (await cookies()).delete(SESSION_COOKIE);
}
