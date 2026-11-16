import { devOnlyEnabled } from "@/dev-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { AppVoice } from "../_components/AppVoice";
import { getProduct, getStrings } from "@/product";
import { startCheckout } from "../settings/actions";

export const dynamic = "force-dynamic";

export default async function Paywall() {
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");
  const str = getStrings();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <AppVoice screen="paywall_morning">
        <p>
          {str["billing.price"]} · {str["billing.features"]}
        </p>
        <p>{str["billing.noGrowth"]}</p>
      </AppVoice>
      <form action={startCheckout}>
        <button type="submit" className="btn">
          {str["billing.subscribe"]}
        </button>
      </form>
      <Link href="/chat" className="text-sm underline">
        {str["paywall.notNow"]}
      </Link>
      {getProduct() === "jp" ? (
        <p className="flex flex-col gap-1 text-sm">
          <Link href="/legal/tokushoho" className="underline">
            {str["legal.tokushoho"]}
          </Link>
          <Link href="/legal/terms" className="underline">
            {str["legal.terms"]}
          </Link>
          <Link href="/privacy" className="underline">
            {str["privacy.title"]}
          </Link>
        </p>
      ) : null}
    </main>
  );
}
