import { devOnlyEnabled } from "@/dev-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getStrings, type StringKey } from "@/product";
import { AppVoice } from "../_components/AppVoice";
import { completeOnboarding } from "./actions";
import { CITIES } from "./cities";
import { TimezoneField } from "./TimezoneField";

const ERRORS: Record<string, StringKey> = {
  invalid: "onboarding.error.invalid",
  underage: "onboarding.error.underage",
  no_content: "onboarding.error.no_content",
};

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");
  const { error } = await searchParams;
  const year = new Date().getFullYear();
  const str = getStrings();
  const errorKey = error ? ERRORS[error] : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6 py-8">
      {errorKey ? <AppVoice screen="signup">{str[errorKey]}</AppVoice> : null}
      <form action={completeOnboarding} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span>{str["onboarding.name"]}</span>
          <input name="displayName" defaultValue={user.displayName} required maxLength={40} className="field" />
        </label>
        <label className="flex flex-col gap-1">
          <span>{str["onboarding.city"]}</span>
          <select name="city" required defaultValue="seoul" className="field">
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {str[`city.${c.id}`]}
              </option>
            ))}
          </select>
        </label>
        <TimezoneField />
        <label className="flex flex-col gap-1">
          <span>{str["onboarding.birthYear"]}</span>
          <input name="birthYear" type="number" required min={year - 100} max={year} className="field" />
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="aiNotice" required />
          <span>{str["ai.notice"]}</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="terms" required />
          <span>
            {str["onboarding.agree"].split(/(\{terms\}|\{privacy\})/).map((part, i) =>
              part === "{terms}" ? (
                <Link key={i} href="/legal/terms" className="underline">
                  {str["account.termsLink"]}
                </Link>
              ) : part === "{privacy}" ? (
                <Link key={i} href="/privacy" className="underline">
                  {str["account.privacyLink"]}
                </Link>
              ) : (
                part
              ),
            )}
          </span>
        </label>
        <button type="submit" className="btn">
          {str["onboarding.continue"]}
        </button>
      </form>
    </main>
  );
}
