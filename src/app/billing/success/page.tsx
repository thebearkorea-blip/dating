import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { applyCheckoutSession } from "@/billing/stripe";
import { getDb } from "@/db/client";
import { devOnlyEnabled } from "@/dev-only";

export const dynamic = "force-dynamic";

export default async function BillingSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(devOnlyEnabled() ? "/dev-login" : "/sign-in");
  const { session_id } = await searchParams;
  if (session_id) {
    try {
      await applyCheckoutSession(getDb(), session_id, user.id);
    } catch (e) {
      // 웹훅이 정식 경로라 반영 실패는 설정으로 보내고 로그만 남긴다.
      console.error("checkout 복귀 반영 실패", e);
    }
  }
  redirect("/settings");
}
