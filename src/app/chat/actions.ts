"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "@/auth/index";
import { getDb } from "@/db/client";
import { generateReplyFor, recordUserMessage } from "@/engine/chat";
import { rateMessageCore } from "@/engine/ratings";
import { handleReconcile } from "@/engine/reconcile";

/**
 * 어떤 예외든 삼킨다. 앱은 에러 화면을 보이지 않는다(화면은 그대로).
 * 사용자 메시지만 저장하고 바로 돌아간다. 답장 생성(LLM)은 응답 뒤 after()에서 돈다.
 */
export async function sendMessage(text: string): Promise<{ ok: boolean }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false };
    const r = await recordUserMessage({ db: getDb() }, user.id, String(text));
    if (r.status === "ok") {
      after(async () => {
        try {
          await generateReplyFor({ db: getDb() }, user.id, r.relId, r.userMsgId, String(text));
        } catch (e) {
          console.error("generateReplyFor failed", e);
        }
      });
    }
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

/** 베타 테스터의 대사 평가. 베타가 아니면 아무것도 저장하지 않는다. */
export async function rateMessage(msgId: string, score: number, note: string): Promise<{ ok: boolean }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false };
    return { ok: (await rateMessageCore(getDb(), user, String(msgId), Number(score), String(note ?? ""))) === "ok" };
  } catch {
    return { ok: false };
  }
}
