"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { handleUserMessage } from "@/engine/chat";
import { handleReconcile } from "@/engine/reconcile";

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

/** 이별 뒤 재시작(사과 입력). 결과 종류만 돌려준다(날짜·내부 값 없음). */
export async function sendApology(text: string): Promise<{ result: "accepted" | "declined" | "too_early" | "other" }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { result: "other" };
    const r = await handleReconcile({ db: getDb() }, user.id, String(text));
    revalidatePath("/chat");
    return { result: r === "accepted" || r === "declined" || r === "too_early" ? r : "other" };
  } catch {
    return { result: "other" };
  }
}
