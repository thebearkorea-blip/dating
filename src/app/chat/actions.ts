"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { handleUserMessage } from "@/engine/chat";

export async function sendMessage(text: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("unauthorized");
  await handleUserMessage({ db: getDb() }, user.id, String(text));
  revalidatePath("/chat");
}
