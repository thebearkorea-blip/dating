import Link from "next/link";
import { getCurrentUser } from "@/auth/index";
import { devOnlyEnabled } from "@/dev-only";
import { SUPPORT_CATEGORIES, SUPPORT_MAX_TEXT } from "@/engine/support";
import { fmt, getStrings, tabBarLabels, type StringKey } from "@/product";
import { TabBar } from "../TabBar";
import { sendSupportRequest } from "./actions";

export const dynamic = "force-dynamic";

const FAQ = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export default async function Support({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const str = getStrings();
  const { sent, error } = await searchParams;
  const user = await getCurrentUser();
  const email = process.env.SUPPORT_EMAIL;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{str["support.title"]}</h1>
        <Link href="/settings" className="text-sm underline">
          {str["header.back"]}
        </Link>
      </header>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{str["support.faqTitle"]}</h2>
        {FAQ.map((n) => (
          <details key={n} className="rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-sm">
            <summary className="cursor-pointer font-medium">{str[`support.faq${n}.q` as StringKey]}</summary>
            <p className="mt-2 text-[var(--color-ink-soft)]">{str[`support.faq${n}.a` as StringKey]}</p>
          </details>
        ))}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{str["support.contactTitle"]}</h2>
        {sent ? (
          <p role="status" className="text-sm">
            {str["support.sent"]}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm">
            {str["support.failed"]}
          </p>
        ) : null}
        {user ? (
          <form action={sendSupportRequest} className="flex flex-col gap-2 text-sm">
            <label className="flex flex-col gap-1">
              {str["support.category"]}
              <select name="category" defaultValue="other" className="rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
                {SUPPORT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {str[`support.cat.${c}` as StringKey]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              {str["support.message"]}
              <textarea
                name="message"
                required
                rows={5}
                maxLength={SUPPORT_MAX_TEXT}
                className="rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2"
              />
            </label>
            <button type="submit" className="btn">
              {str["support.send"]}
            </button>
          </form>
        ) : (
          <p className="text-sm">
            {str["support.signinPrompt"]}{" "}
            <Link href={devOnlyEnabled() ? "/dev-login" : "/sign-in"} className="underline">
              {str["support.signIn"]}
            </Link>
          </p>
        )}
        {email ? <p className="text-sm">{fmt(str["support.email"], { email })}</p> : null}
      </section>
      {user ? <TabBar labels={tabBarLabels()} /> : null}
    </main>
  );
}
