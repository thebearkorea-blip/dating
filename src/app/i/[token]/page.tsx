import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { platformIdentities } from "@/db/schema/index";
import { INVITE_COOKIE } from "../../onboarding/invite-cookie";

// 틱톡 DM 전용 토큰 링크. 세션에 토큰을 보관하고, 온보딩 완료 시 platform_identities에 user_id를 연결한다.
async function claim(token: string): Promise<void> {
  "use server";
  const [row] = await getDb()
    .select({ userId: platformIdentities.userId })
    .from(platformIdentities)
    .where(eq(platformIdentities.token, token))
    .limit(1);
  if (!row || row.userId) notFound();
  (await cookies()).set(INVITE_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  redirect((await getCurrentUser()) ? "/onboarding" : "/dev-login");
}

export default async function InviteLanding({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await getDb()
    .select({ userId: platformIdentities.userId })
    .from(platformIdentities)
    .where(eq(platformIdentities.token, token))
    .limit(1);
  if (!row || row.userId) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-3xl font-semibold">He&apos;s here.</p>
      <form action={claim.bind(null, token)}>
        <button type="submit" className="btn">
          Start
        </button>
      </form>
    </main>
  );
}
