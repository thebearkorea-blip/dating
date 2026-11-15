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

export const BUSY_OVERLAY_LINES_KO = [
  "지금 스케줄 호출 와서 가봐야 해요. 이따 얘기해요?",
  "도현이 형이 다 연습실로 모으고 있어요. 끝나고 찾을게요.",
  "루이가 지금 피팅한다고 끌고 가요. 폰 가방에 넣을게요, 이따 봐요.",
  "리허설이 앞당겨졌는데 아직 몸도 못 풀었어요. 되는 대로 문자할게요.",
  "5분 뒤에 보컬 레슨이에요. 살살 해줘요, 오늘 밤에 돌아올게요.",
] as const;

export const UNAVAILABLE_LINES_KO = [
  "폰이 또 말썽이네요… 조금 있다 제대로 답할게요.",
  "이 건물 신호가 진짜 안 좋아요. 좀 나은 데 가서 답장할게요.",
  "배터리 거의 다 됐는데 충전기를 연습실에 두고 왔어요. 이따 얘기해요?",
] as const;

export type Lang = "ko" | "en";

/** 한글(가-힣)이 하나라도 있으면 "ko". */
export function langOf(text: string): Lang {
  return /[가-힣]/.test(text) ? "ko" : "en";
}

export function pickUnavailable(seed: string, lang: Lang = "en"): string {
  const pool = lang === "ko" ? UNAVAILABLE_LINES_KO : UNAVAILABLE_LINES;
  return pool[hash32(seed) % pool.length] as string;
}

/** seed가 같으면 같은 문장. */
export function pickBusyOverlay(seed: string, lang: Lang = "en"): string {
  const pool = lang === "ko" ? BUSY_OVERLAY_LINES_KO : BUSY_OVERLAY_LINES;
  return pool[hash32(seed) % pool.length] as string;
}
