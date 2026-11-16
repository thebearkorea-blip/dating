// 입력 중 창·읽음 시각 계산(순수 함수). chat.ts와 chat-view.ts가 함께 쓴다.
import { hash32 } from "./schedule.js";

const TYPING_BASE_MS = 4000;
const TYPING_PER_CHAR_MS = 40;
const TYPING_MAX_MS = 12000;

/** 입력 중 창 길이. deliver_at 전 이 시간부터 typing. */
export function typingWindowMs(textLength: number): number {
  return Math.min(TYPING_BASE_MS + textLength * TYPING_PER_CHAR_MS, TYPING_MAX_MS);
}

/** 지연 0 답장: 보낸 뒤 1~2초 뒤부터 입력 중(메시지 id로 고정). */
export function typingStartDelayMs(userMsgId: string): number {
  return 1000 + (hash32(`${userMsgId}:typing`) % 1000);
}

/**
 * 사용자 메시지를 그가 '읽은' 시각: 보낸 시각 ~ 입력 중 시작 사이(메시지 id로 고정).
 * 지연이 있으면 입력 중 시작은 deliverAt - 창, 지연 0이면 보낸 뒤 1~2초.
 */
export function seenAtFor(userMsgId: string, userAt: Date, deliverAt: Date, replyLength: number): Date {
  const lo = userAt.getTime();
  const windowStart = deliverAt.getTime() - typingWindowMs(replyLength);
  const hi = windowStart > lo ? windowStart : lo + typingStartDelayMs(userMsgId);
  return new Date(lo + (hash32(`${userMsgId}:seen`) % (hi - lo + 1)));
}
