import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { AppVoice } from "../_components/AppVoice";
import { startCheckout } from "../settings/actions";

export const dynamic = "force-dynamic";

export default async function Paywall() {
  const user = await getCurrentUser();
  if (!user) redirect("/dev-login");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <AppVoice screen="paywall_morning">
        <p>$10 / month · 100 messages a day · photos</p>
        <p>Payments never affect his growth.</p>
      </AppVoice>
      <form action={startCheckout}>
        <button type="submit" className="btn">
          Subscribe
        </button>
      </form>
      <Link href="/chat" className="text-sm underline">
        Not now
      </Link>
    </main>
  );
}
