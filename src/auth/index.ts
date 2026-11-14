// 인증. Clerk 세션을 먼저 보고(personal.users.clerk_user_id로 매핑, 최초 로그인 시 행 생성), 없으면 개발 환경에서만 dev_session 쿠키 스텁을 본다.
// is_beta·is_admin은 Clerk publicMetadata(is_beta·is_admin)가 있으면 그 값, 없으면 DB 값.
// 호출자(페이지·Server Action)는 이 인터페이스만 쓴다. devLogin은 개발 전용이다.
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/index";
import { assertDevOnly, devOnlyEnabled } from "@/dev-only";

export const SESSION_COOKIE = "dev_session";
export type CurrentUser = typeof users.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getClerkUser(): Promise<CurrentUser | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  // 요청마다 Clerk API를 부르지 않도록 세션 토큰 클레임에서 읽는다(Clerk 대시보드 session token에 {"metadata": "{{user.public_metadata}}"} 설정 필요).
  const meta = ((sessionClaims as { metadata?: unknown } | null)?.metadata ?? {}) as { is_admin?: unknown; is_beta?: unknown };
  const db = getDb();
  let [u] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
  if (!u) {
    const c = await currentUser();
    const displayName = (c?.firstName ?? c?.username ?? c?.primaryEmailAddress?.emailAddress.split("@")[0] ?? "user").slice(0, 40);
    // 온보딩 미완료 상태(city 등 null)로 만든다. 페이지가 /onboarding으로 보낸다.
    await db.insert(users).values({ clerkUserId: userId, displayName }).onConflictDoNothing({ target: users.clerkUserId });
    [u] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
  }
  if (!u) return null;
  return {
    ...u,
    isAdmin: typeof meta.is_admin === "boolean" ? meta.is_admin : u.isAdmin,
    isBeta: typeof meta.is_beta === "boolean" ? meta.is_beta : u.isBeta,
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const clerk = await getClerkUser();
  if (clerk) return clerk;
  if (!devOnlyEnabled()) return null;
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id || !UUID.test(id)) return null;
  const [u] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

export async function devLogin(displayName: string, flags: { beta?: boolean; admin?: boolean } = {}): Promise<CurrentUser> {
  "use server";
  assertDevOnly("dev-login");
  const name = displayName.trim().slice(0, 40) || "dev";
  const [u] = await getDb().insert(users).values({ displayName: name, isBeta: !!flags.beta, isAdmin: !!flags.admin }).returning();
  if (!u) throw new Error("user insert failed");
  (await cookies()).set(SESSION_COOKIE, u.id, { httpOnly: true, sameSite: "lax", path: "/" });
  return u;
}

export async function signOut(): Promise<void> {
  "use server";
  (await cookies()).delete(SESSION_COOKIE);
}
