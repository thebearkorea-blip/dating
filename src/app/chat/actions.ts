"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { handleUserMessage } from "@/engine/chat";

/** 어떤 예외든 삼킨다. 앱은 에러 화면을 보이지 않는다(화면은 그대로). */
export async function sendMessage(text: string): Promise<{ ok: boolean }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false };
    await handleUserMessage({ db: getDb() }, user.id, String(text));
    revalidatePath("/chat");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
