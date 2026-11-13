"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { memories, relationships } from "@/db/schema/index";

export async function deleteMemory(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("unauthorized");
  const id = String(formData.get("id") ?? "");
  const db = getDb();
  const [rel] = await db
    .select({ id: relationships.id })
    .from(relationships)
    .where(and(eq(relationships.userId, user.id), eq(relationships.characterId, "ihan")))
    .limit(1);
  if (!rel) return;
  await db
    .update(memories)
    .set({ deletedAt: new Date() })
    .where(and(eq(memories.id, id), eq(memories.relId, rel.id), isNull(memories.deletedAt)));
  revalidatePath("/me");
}
