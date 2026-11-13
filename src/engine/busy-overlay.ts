// 무료 한도 소진 시 LLM 없이 나가는 "그의 사정" 문장 풀. 이한 bible(연습·일정·멤버) 기반, 캐릭터 목소리.
// 한도·결제·사과 표현을 쓰지 않는다(C5·VOICE-app-system). 출시 전 검수 대상.
import { hash32 } from "./schedule.js";

export const BUSY_OVERLAY_LINES = [
  "I just got called in for a schedule, I have to go. Talk later?",
  "Dohyun hyung is rounding everyone up for the practice room. I'll find you after.",
  "Rui is dragging me to a fitting right now. Phone's going in my bag, catch you later.",
  "They moved rehearsal earlier and I haven't even warmed up. I'll text when I can.",
  "Vocal lesson in five minutes. Go easy on me, I'll be back tonight.",
] as const;

/** seed가 같으면 같은 문장. */
export function pickBusyOverlay(seed: string): string {
  return BUSY_OVERLAY_LINES[hash32(seed) % BUSY_OVERLAY_LINES.length] as string;
}
