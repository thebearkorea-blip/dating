import { and, asc, desc, eq, lte } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { activityLine, currentActivity, nextDeliverAt } from "@/engine/chat";
import { messages, relationships } from "@/db/schema/index";
import { DevBanner } from "../_components/DevBanner";
import { Composer } from "./Composer";
import { DeliveryTimer } from "./DeliveryTimer";

export const dynamic = "force-dynamic";

export default async function Chat() {
  const user = await getCurrentUser();
  if (!user) redirect("/dev-login");
  const db = getDb();
  // 숨김 컬럼은 선택하지 않는다(화면·DTO에 싣지 않음).
  const [rel] = await db
    .select({ id: relationships.id, stage: relationships.stage })
    .from(relationships)
    .where(and(eq(relationships.userId, user.id), eq(relationships.characterId, "ihan")))
    .limit(1);
  if (!rel) redirect("/onboarding");

  const now = new Date();
  const rows = await db
    .select({ id: messages.id, sender: messages.sender, text: messages.text, mediaId: messages.mediaId })
    .from(messages)
    .where(and(eq(messages.relId, rel.id), lte(messages.deliverAt, now)))
    .orderBy(desc(messages.at))
    .limit(100);
  const list = rows.reverse();
  const next = await nextDeliverAt(db, rel.id, now);
  const line = activityLine(await currentActivity(db, rel.stage, now));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <DevBanner />
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <p className="text-sm text-[var(--color-ink-soft)]">{line}</p>
        <span className="flex gap-3">
          <Link href="/me" className="text-sm underline">
            Memories
          </Link>
          <Link href="/settings" className="text-sm underline">
            Settings
          </Link>
        </span>
      </header>
      <ul className="flex flex-1 flex-col gap-2 p-4">
        {list.map((m) => (
          <li
            key={m.id}
            className={
              m.sender === "user"
                ? "ml-auto max-w-[80%] rounded-[var(--radius-bubble-mine)] bg-[var(--color-bubble-mine)] px-4 py-2 text-[var(--color-bubble-mine-ink)]"
                : "mr-auto max-w-[80%] rounded-[var(--radius-bubble)] bg-[var(--color-bubble-his)] px-4 py-2 text-[var(--color-bubble-his-ink)]"
            }
          >
            {m.mediaId ? <img src={`/api/media/${m.mediaId}`} alt="" className="mb-2 w-full rounded-[var(--radius-control)]" /> : null}
            {m.text}
          </li>
        ))}
      </ul>
      {next ? <DeliveryTimer at={next.toISOString()} /> : null}
      <Composer />
    </main>
  );
}
