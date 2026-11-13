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

/** LLM 호출이 실패했을 때(서버 사정) 나가는 문장 풀. 그의 사정으로 읽히게, 앱 목소리·사과·한도 표현 없이. */
export const UNAVAILABLE_LINES = [
  "My phone's acting up again… can I text you properly in a bit?",
  "Signal in this building is terrible. I'll write back once I'm somewhere better.",
  "My battery's about to die and I left my charger at the practice room. Talk soon?",
] as const;

export function pickUnavailable(seed: string): string {
  return UNAVAILABLE_LINES[hash32(seed) % UNAVAILABLE_LINES.length] as string;
}

/** seed가 같으면 같은 문장. */
export function pickBusyOverlay(seed: string): string {
  return BUSY_OVERLAY_LINES[hash32(seed) % BUSY_OVERLAY_LINES.length] as string;
}
