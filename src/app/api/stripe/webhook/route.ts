import { createStripeProvider, WebhookSignatureError } from "@/billing/stripe";
import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  if (!sig) return Response.json({ error: "missing signature" }, { status: 400 });
  try {
    const result = await createStripeProvider(getDb()).handleWebhook(raw, sig);
    return Response.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof WebhookSignatureError) return Response.json({ error: "invalid signature" }, { status: 400 });
    console.error("stripe webhook 처리 실패", e);
    return Response.json({ error: "webhook failed" }, { status: 500 });
  }
}
