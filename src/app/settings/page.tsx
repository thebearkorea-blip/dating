import { devOnlyEnabled } from "@/dev-only";
import { and, eq } from "drizzle-orm";
import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getPlanView } from "@/billing/index";
import { getDb } from "@/db/client";
import { relationships } from "@/db/schema/index";
import { fmt, getCharacterId, getProduct, getStrings } from "@/product";
import { AppVoice } from "../_components/AppVoice";
import { cancelSubscription, deleteAccount, deleteAllConversations, saveSettings, startCheckout } from "./actions";
import { ConfirmDelete } from "./ConfirmDelete";
import { PushToggle } from "./PushToggle";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");
  const [rel] = await getDb()
    .select({ pushWindow: relationships.pushWindow, pushMax: relationships.pushMax })
    .from(relationships)
    .where(and(eq(relationships.userId, user.id), eq(relationships.characterId, getCharacterId())))
    .limit(1);
  if (!rel) redirect("/onboarding");
  const plan = await getPlanView(getDb(), user.id, new Date());
  const w = (rel.pushWindow as { start?: string; end?: string } | null) ?? {};
  const str = getStrings();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{str["header.settings"]}</h1>
        <Link href="/chat" className="text-sm underline">
          {str["header.back"]}
        </Link>
      </header>
      <AppVoice screen="settings">
        <p>{str["billing.noGrowth"]}</p>
        {plan.plan === "paid" ? (
          <p>
            {plan.periodEnd
              ? fmt(str[plan.cancelAtPeriodEnd ? "settings.planPaidEnds" : "settings.planPaidRenews"], { date: plan.periodEnd.toISOString().slice(0, 10) })
              : str["settings.planPaid"]}
          </p>
        ) : (
          <p>{str["settings.planFree"]}</p>
        )}
        <p>
          {str["billing.price"]} · {str["billing.features"]}
        </p>
        {plan.plan === "paid" ? (
          plan.cancelAtPeriodEnd ? null : (
            <form action={cancelSubscription}>
              <button type="submit" className="btn">
                {str["billing.cancel"]}
              </button>
            </form>
          )
        ) : (
          <form action={startCheckout}>
            <button type="submit" className="btn">
              {str["billing.subscribe"]}
            </button>
          </form>
        )}
      </AppVoice>
      <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY ?? ""} label={str["settings.notifications"]} unavailableLabel={str["settings.notificationsUnavailable"]} />
      <form action={saveSettings} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span>{str["settings.timeZone"]}</span>
          <input name="tz" defaultValue={user.tz ?? "Asia/Seoul"} className="field" />
        </label>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span>{str["settings.messagesFrom"]}</span>
            <input name="start" type="time" defaultValue={w.start ?? "09:00"} className="field" />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span>{str["settings.until"]}</span>
            <input name="end" type="time" defaultValue={w.end ?? "23:00"} className="field" />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span>{str["settings.maxPerDay"]}</span>
          <input name="pushMax" type="number" min={0} max={4} defaultValue={rel.pushMax ?? 2} className="field" />
        </label>
        <button type="submit" className="btn">
          {str["settings.save"]}
        </button>
      </form>
      <AppVoice screen="settings">
        <p>{str["settings.dataNote"]}</p>
        <ConfirmDelete action={deleteAllConversations} label={str["settings.deleteConversations"]} confirmLabel={str["settings.deleteConversationsConfirm"]} keepLabel={str["settings.keep"]} />
        <ConfirmDelete action={deleteAccount} label={str["settings.deleteAccount"]} confirmLabel={str["settings.deleteAccountConfirm"]} keepLabel={str["settings.keep"]} />
        <SignOutButton redirectUrl="/">
          <button type="button" className="btn">
            {str["settings.signOut"]}
          </button>
        </SignOutButton>
        <p>
          <Link href="/privacy" className="underline">
            {str["privacy.title"]}
          </Link>
        </p>
        {getProduct() === "jp" ? (
          <p className="flex flex-col gap-1">
            <Link href="/legal/tokushoho" className="underline">
              {str["legal.tokushoho"]}
            </Link>
            <Link href="/legal/terms" className="underline">
              {str["legal.terms"]}
            </Link>
          </p>
        ) : null}
      </AppVoice>
      <section id="ai-notice" className="flex flex-col gap-1">
        <AppVoice screen="ai_notice">
          <p>{str["ai.notice"]}</p>
        </AppVoice>
      </section>
      <a href="#ai-notice" className="text-sm underline">
        {str["settings.showAiNotice"]}
      </a>
    </main>
  );
}
