// 개발 전용 mock 결제 화면. 출시 금지(프로덕션에서는 404).
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { mockSubscribe } from "@/billing/mock";
import { getDb } from "@/db/client";
import { assertDevOnly, devOnlyEnabled } from "@/dev-only";
import { AppVoice } from "../../_components/AppVoice";
import { DevBanner } from "../../_components/DevBanner";

export const dynamic = "force-dynamic";

async function subscribe() {
  "use server";
  assertDevOnly("mock-checkout");
  const user = await getCurrentUser();
  if (!user) return;
  await mockSubscribe(getDb(), user.id, new Date());
  redirect("/settings");
}

export default async function MockCheckout() {
  if (!devOnlyEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6">
      <DevBanner />
      <AppVoice screen="dev_banner">개발 전용 결제 화면입니다. 출시 빌드에서는 Stripe로 교체됩니다.</AppVoice>
      <form action={subscribe}>
        <button type="submit" className="btn">
          Subscribe
        </button>
      </form>
    </main>
  );
}
