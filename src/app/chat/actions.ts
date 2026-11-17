"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "@/auth/index";
import { now as clockNow } from "@/clock";
import { getDb } from "@/db/client";
import { generateReplyFor, recordUserMessage } from "@/engine/chat";
import { isUuid } from "@/engine/chat-view";
import { rateMessageCore } from "@/engine/ratings";
import { setUserReaction } from "@/engine/reactions";
import { handleReconcile } from "@/engine/reconcile";
import { BURST_LIMIT, recentUserMessageCount, reportReply } from "@/engine/support";

/**
 * 어떤 예외든 삼킨다. 앱은 에러 화면을 보이지 않는다(화면은 그대로).
 * 사용자 메시지만 저장하고 바로 돌아간다. 답장 생성(LLM)은 응답 뒤 after()에서 돈다.
 * id는 클라이언트가 만든 uuid. 같은 id로 다시 오면(재시도) 저장·답장 생성 없이 ok만 돌려준다.
 * 목록은 클라이언트가 직접 다시 불러오므로 revalidatePath는 부르지 않는다.
 * replyTo(인용 대상)는 같은 관계의 도착한 메시지만. 아니면 저장하지 않고 ok:false.
 */
export async function sendMessage(text: string, id: string, replyTo?: string | null): Promise<{ ok: boolean; limited?: boolean }> {
  try {
    if (typeof id !== "string" || !isUuid(id)) return { ok: false };
    if (replyTo != null && (typeof replyTo !== "string" || !isUuid(replyTo))) return { ok: false };
    const user = await getCurrentUser();
    if (!user) return { ok: false };
    // 연타 제한(W4): 최근 60초에 이미 BURST_LIMIT개를 보냈으면 저장하지 않는다. 클라이언트는 글자를 남기고 안내한다.
    if ((await recentUserMessageCount(getDb(), user.id, clockNow())) >= BURST_LIMIT) return { ok: false, limited: true };
    const r = await recordUserMessage({ db: getDb() }, user.id, String(text), id, replyTo ?? null);
    if (r.status === "duplicate") return { ok: true };
    if (r.status === "ok") {
      after(async () => {
        try {
          await generateReplyFor({ db: getDb() }, user.id, r.relId, r.userMsgId, String(text));
        } catch (e) {
          console.error("generateReplyFor failed", e);
        }
      });
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** 그의 메시지에 내 반응 1개(emoji=null이면 취소). 허용 목록·소유·도착·보낸 사람 검사는 엔진이 한다. */
export async function setReaction(msgId: string, emoji: string | null): Promise<{ ok: boolean }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false };
    const r = await setUserReaction(getDb(), user.id, String(msgId), emoji === null ? null : String(emoji), clockNow());
    return { ok: r === "ok" };
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

// --- W4 ---
/** 그의 메시지 신고. 내 관계의 도착한 그의 메시지만(검사는 reportReply). 대화에는 영향이 없다. */
export async function reportMessage(msgId: string, reason: string): Promise<{ ok: boolean }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false };
    return { ok: (await reportReply(getDb(), user.id, msgId, reason, clockNow())) === "ok" };
  } catch {
    return { ok: false };
  }
}
