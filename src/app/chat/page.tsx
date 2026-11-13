import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { relationships } from "@/db/schema/index";
import { DevBanner } from "../_components/DevBanner";

// 채팅 본체는 ②. 여기서는 정말 빈 상태 + 입력창만 둔다.
export default async function Chat() {
  const user = await getCurrentUser();
  if (!user) redirect("/dev-login");
  const [rel] = await getDb()
    .select({ id: relationships.id })
    .from(relationships)
    .where(and(eq(relationships.userId, user.id), eq(relationships.characterId, "ihan")))
    .limit(1);
  if (!rel) redirect("/onboarding");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <DevBanner />
      <div className="flex-1" />
      <form className="flex gap-2 p-4">
        <input name="text" aria-label="message" className="field" autoComplete="off" />
      </form>
    </main>
  );
}
