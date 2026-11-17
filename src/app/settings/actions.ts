"use server";
import { and, eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, signOut } from "@/auth/index";
import { getDb } from "@/db/client";
import { getBillingProvider } from "@/billing/index";
import { deleteAccount as wipeAccount, deleteAllConversations as wipeConversations } from "@/engine/data-deletion";
import { pushSubscriptions, relationships, users } from "@/db/schema/index";
import { getCharacterId } from "@/product";
import { CITIES } from "../onboarding/cities";

const HM = /^([01]?\d|2[0-3]):[0-5]\d$/;

export async function saveSettings(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const max = Number(formData.get("pushMax"));
  const db = getDb();
  const set: { pushWindow?: { start: string; end: string }; pushMax?: number } = {};
  if (HM.test(start) && HM.test(end) && start !== end) set.pushWindow = { start, end };
  if (Number.isInteger(max) && max >= 0 && max <= 4) set.pushMax = max;
  if (Object.keys(set).length > 0) {
    await db.update(relationships).set(set).where(and(eq(relationships.userId, user.id), eq(relationships.characterId, getCharacterId())));
  }
  revalidatePath("/settings");
}

export async function saveProfile(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const name = String(formData.get("displayName") ?? "").trim().slice(0, 40);
  const city = CITIES.find((c) => c.id === formData.get("city"));
  const set: { displayName?: string; city?: string; tz?: string } = {};
  if (name) set.displayName = name;
  // 도시를 바꿨을 때만 시간대를 그 도시 값으로 맞춘다(그대로면 가입 때 받은 브라우저 시간대 유지).
  if (city && city.id !== user.city) {
    set.city = city.id;
    set.tz = city.tz;
  }
  if (Object.keys(set).length > 0) await getDb().update(users).set(set).where(eq(users.id, user.id));
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

export async function deleteAllConversations(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await wipeConversations(getDb(), user.id);
  revalidatePath("/chat");
  revalidatePath("/me");
  revalidatePath("/settings");
}

export async function deleteAccount(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const clerkUserId = user.clerkUserId;
  await wipeAccount(getDb(), user.id);
  // dev-login 사용자(clerkUserId 없음)는 건너뛴다. Clerk 삭제가 실패해도 앱 데이터 삭제는 이미 끝났다.
  if (clerkUserId) {
    try {
      await (await clerkClient()).users.deleteUser(clerkUserId);
    } catch (e) {
      console.error("clerk deleteUser failed", clerkUserId, e);
    }
  }
  await signOut();
  redirect("/");
}
