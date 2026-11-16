"use server";
import { devOnlyEnabled } from "@/dev-only";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { characters, memories, messages, platformIdentities, relationships, users } from "@/db/schema/index";
import { recordEvent } from "@/engine/events";
import { fillScene, firstOpenScene, sceneTag } from "@/engine/first-week";
import { ageGate } from "@/policy/age-gate";
import { getCharacterId } from "@/product";
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

  const characterId = getCharacterId();
  const [character] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId)).limit(1);
  if (!character) redirect("/onboarding?error=no_content");

  const jar = await cookies();
  const token = jar.get(INVITE_COOKIE)?.value;

  await db.transaction(async (tx) => {
    const [rel] = await tx
      .insert(relationships)
      .values({ userId: user.id, characterId, mode: "romance", startedAt: new Date(), stage: 1, affection: 0 })
      .onConflictDoNothing()
      .returning();
    if (!rel) return;
    let seedMemory: string | null = null;
    if (token) {
      const [identity] = await tx
        .update(platformIdentities)
        .set({ userId: user.id, claimedAt: new Date() })
        .where(and(eq(platformIdentities.token, token), isNull(platformIdentities.userId)))
        .returning();
      seedMemory = identity?.seedMemory ?? null;
      if (seedMemory) await tx.insert(memories).values({ relId: rel.id, fact: seedMemory });
    }
    // 첫 접속 장면(first_open_*): 직접 가입은 direct, 초대 링크는 via_link. 대본이 없으면 아무것도 보내지 않는다.
    const scene = firstOpenScene(characterId, !!token);
    if (scene) {
      const texts = fillScene(scene.bubbles, { user_name: name, seed_memory: seedMemory });
      const start = Date.now();
      for (const [i, text] of texts.entries()) {
        const when = new Date(start + i * 4000);
        await tx.insert(messages).values({ relId: rel.id, at: when, deliverAt: when, sender: "char", text, origin: "scene", tag: sceneTag(scene) });
      }
    }
  });

  if (token) jar.delete(INVITE_COOKIE);
  await recordEvent(db, user.id, "signup", { once: "ever", meta: token ? { invite: true } : undefined });
  redirect("/chat");
}
