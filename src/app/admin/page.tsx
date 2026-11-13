import { CostTab } from "./cost";
import { FunnelTab } from "./funnel";
import { RatingsTab } from "./ratings";
import { requireAdmin } from "./require-admin";
import { ReviewTab } from "./review";
import { UsersTab } from "./users";

export const dynamic = "force-dynamic";

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string }> }) {
  await requireAdmin();
  const { tab, days } = await searchParams;
  const d = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  switch (tab) {
    case "review":
      return <ReviewTab />;
    case "cost":
      return <CostTab days={d} />;
    case "funnel":
      return <FunnelTab />;
    case "users":
      return <UsersTab />;
    default:
      return <RatingsTab />;
  }
}
