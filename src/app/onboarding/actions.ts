"use server";
import { devOnlyEnabled } from "@/dev-only";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { characters, memories, platformIdentities, relationships, users } from "@/db/schema/index";
import { recordEvent } from "@/engine/events";
import { ageGate } from "@/policy/age-gate";
import { CITIES } from "./cities";
import { INVITE_COOKIE } from "./invite-cookie";

function validTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz !== "";
  } catch {
    return false;
  }
}

export async function completeOnboarding(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");

  const name = String(formData.get("displayName") ?? "").trim().slice(0, 40);
  const city = CITIES.find((c) => c.id === formData.get("city"));
  const birthYear = Number(formData.get("birthYear"));
  const consent = formData.get("aiNotice") === "on";
  if (!name || !city || !Number.isInteger(birthYear) || !consent) redirect("/onboarding?error=invalid");

  const gate = ageGate(birthYear);
  if (gate.kind === "rejected") redirect("/onboarding?error=underage");

  const postedTz = String(formData.get("tz") ?? "");
  const tz = validTz(postedTz) ? postedTz : city.tz;
  const db = getDb();

  await db
    .update(users)
    .set({
      displayName: name,
      city: city.id,
      tz,
      birthYear,
      birthYearVerified: false,
      ageBand: gate.ageBand,
      aiNoticeAcceptedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  if (gate.kind === "preparing") redirect("/onboarding/preparing");

  const [ihan] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, "ihan")).limit(1);
  if (!ihan) redirect("/onboarding?error=no_content");

  const jar = await cookies();
  const token = jar.get(INVITE_COOKIE)?.value;

  await db.transaction(async (tx) => {
    const [rel] = await tx
      .insert(relationships)
      .values({ userId: user.id, characterId: "ihan", mode: "romance", startedAt: new Date(), stage: 1, affection: 0 })
      .onConflictDoNothing()
      .returning();
    if (!rel || !token) return;
    const [identity] = await tx
      .update(platformIdentities)
      .set({ userId: user.id, claimedAt: new Date() })
      .where(and(eq(platformIdentities.token, token), isNull(platformIdentities.userId)))
      .returning();
    if (identity?.seedMemory) {
      await tx.insert(memories).values({ relId: rel.id, fact: identity.seedMemory });
    }
  });

  if (token) jar.delete(INVITE_COOKIE);
  await recordEvent(db, user.id, "signup", { once: "ever", meta: token ? { invite: true } : undefined });
  redirect("/chat");
}
