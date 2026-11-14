import { and, eq } from "drizzle-orm";
import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getPlanView } from "@/billing/index";
import { getDb } from "@/db/client";
import { relationships } from "@/db/schema/index";
import { AppVoice } from "../_components/AppVoice";
import { cancelSubscription, deleteAccount, deleteAllConversations, saveSettings, startCheckout } from "./actions";
import { ConfirmDelete } from "./ConfirmDelete";
import { PushToggle } from "./PushToggle";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await getCurrentUser();
  if (!user) redirect("/dev-login");
  const [rel] = await getDb()
    .select({ pushWindow: relationships.pushWindow, pushMax: relationships.pushMax })
    .from(relationships)
    .where(and(eq(relationships.userId, user.id), eq(relationships.characterId, "ihan")))
    .limit(1);
  if (!rel) redirect("/onboarding");
  const plan = await getPlanView(getDb(), user.id, new Date());
  const w = (rel.pushWindow as { start?: string; end?: string } | null) ?? {};

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Settings</h1>
        <Link href="/chat" className="text-sm underline">
          Back
        </Link>
      </header>
      <AppVoice screen="settings">
        <p>Payments never affect his growth.</p>
        {plan.plan === "paid" ? (
          <p>
            Plan: Paid
            {plan.periodEnd ? ` · ${plan.cancelAtPeriodEnd ? "ends" : "renews"} ${plan.periodEnd.toISOString().slice(0, 10)}` : ""}
          </p>
        ) : (
          <p>Plan: Free</p>
        )}
        <p>$10 / month · 100 messages a day · photos</p>
        {plan.plan === "paid" ? (
          plan.cancelAtPeriodEnd ? null : (
            <form action={cancelSubscription}>
              <button type="submit" className="btn">
                Cancel
              </button>
            </form>
          )
        ) : (
          <form action={startCheckout}>
            <button type="submit" className="btn">
              Subscribe
            </button>
          </form>
        )}
      </AppVoice>
      <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY ?? ""} />
      <form action={saveSettings} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span>Time zone</span>
          <input name="tz" defaultValue={user.tz ?? "Asia/Seoul"} className="field" />
        </label>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span>Messages from</span>
            <input name="start" type="time" defaultValue={w.start ?? "09:00"} className="field" />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span>until</span>
            <input name="end" type="time" defaultValue={w.end ?? "23:00"} className="field" />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span>Max messages from him per day</span>
          <input name="pushMax" type="number" min={0} max={4} defaultValue={rel.pushMax ?? 2} className="field" />
        </label>
        <button type="submit" className="btn">
          Save
        </button>
      </form>
      <AppVoice screen="settings">
        <p>Your data is yours. Deleting conversations keeps your relationship but starts it over.</p>
        <ConfirmDelete action={deleteAllConversations} label="Delete all conversations" confirmLabel="Really delete conversations" />
        <ConfirmDelete action={deleteAccount} label="Delete account" confirmLabel="Really delete account" />
        <SignOutButton redirectUrl="/">
          <button type="button" className="btn">
            Sign out
          </button>
        </SignOutButton>
        <p>
          <Link href="/privacy" className="underline">
            Privacy notice
          </Link>
        </p>
      </AppVoice>
      <section id="ai-notice" className="flex flex-col gap-1">
        <AppVoice screen="ai_notice">
          <p>He is an AI character.</p>
        </AppVoice>
      </section>
      <a href="#ai-notice" className="text-sm underline">
        Show the AI notice again
      </a>
    </main>
  );
}
