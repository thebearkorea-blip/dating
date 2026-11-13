import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { memories, relationships } from "@/db/schema/index";
import { deleteMemory } from "./actions";

export const dynamic = "force-dynamic";

// 캐릭터 톤 제목. 앱 목소리 박스를 쓰지 않는다.
export default async function Me() {
  const user = await getCurrentUser();
  if (!user) redirect("/dev-login");
  const db = getDb();
  const [rel] = await db
    .select({ id: relationships.id })
    .from(relationships)
    .where(and(eq(relationships.userId, user.id), eq(relationships.characterId, "ihan")))
    .limit(1);
  if (!rel) redirect("/onboarding");
  const rows = await db
    .select({ id: memories.id, fact: memories.fact })
    .from(memories)
    .where(and(eq(memories.relId, rel.id), eq(memories.userVisible, true), isNull(memories.deletedAt)))
    .orderBy(desc(memories.learnedAt));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">What I remember about you</h1>
        <Link href="/chat" className="text-sm underline">
          Back
        </Link>
      </header>
      {rows.length === 0 ? <p className="text-[var(--color-ink-soft)]">Nothing yet. Tell me more about you.</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] bg-[var(--color-surface)] px-4 py-3">
            <span>{m.fact}</span>
            <form action={deleteMemory}>
              <input type="hidden" name="id" value={m.id} />
              <button type="submit" className="text-sm underline">
                Forget
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
