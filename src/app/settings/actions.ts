"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { getBillingProvider } from "@/billing/index";
import { pushSubscriptions, relationships, users } from "@/db/schema/index";

function validTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz !== "";
  } catch {
    return false;
  }
}

const HM = /^([01]?\d|2[0-3]):[0-5]\d$/;

export async function saveSettings(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const tz = String(formData.get("tz") ?? "").trim();
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const max = Number(formData.get("pushMax"));
  const db = getDb();
  if (validTz(tz)) await db.update(users).set({ tz }).where(eq(users.id, user.id));
  const set: { pushWindow?: { start: string; end: string }; pushMax?: number } = {};
  if (HM.test(start) && HM.test(end) && start !== end) set.pushWindow = { start, end };
  if (Number.isInteger(max) && max >= 0 && max <= 4) set.pushMax = max;
  if (Object.keys(set).length > 0) {
    await db.update(relationships).set(set).where(and(eq(relationships.userId, user.id), eq(relationships.characterId, "ihan")));
  }
  revalidatePath("/settings");
}

export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false };
  await getDb()
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await getDb().delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
  return { ok: true };
}

export async function startCheckout(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const { url } = await getBillingProvider(getDb()).createCheckout(user.id);
  redirect(url);
}

export async function cancelSubscription(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await getBillingProvider(getDb()).cancel(user.id);
  revalidatePath("/settings");
}
