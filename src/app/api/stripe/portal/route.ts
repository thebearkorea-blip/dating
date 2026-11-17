import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getStripeClient } from "@/billing/stripe";
import { getDb } from "@/db/client";
import { entitlements } from "@/db/schema/billing";
import { devOnlyEnabled } from "@/dev-only";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");
  const [row] = await getDb().select({ customerId: entitlements.stripeCustomerId }).from(entitlements).where(eq(entitlements.userId, user.id)).limit(1);
  if (!row?.customerId) redirect("/settings");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await getStripeClient().billingPortal.sessions.create({ customer: row.customerId, return_url: `${base}/settings` });
  redirect(session.url);
}
