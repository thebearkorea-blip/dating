// 앱이 캐릭터가 아닌 "앱 목소리"로 직접 말할 수 있는 화면의 흰 목록. 이 밖의 화면은 시스템 문구 스타일을 쓸 수 없다.
export const APP_VOICE_SCREENS = [
  "signup",
  "age",
  "ai_notice",
  "settings",
  "safety",
  "paywall_morning",
  "geo_block",
  "dev_banner",
] as const;

export type AppVoiceScreen = (typeof APP_VOICE_SCREENS)[number];

export function isAppVoiceScreen(id: unknown): id is AppVoiceScreen {
  return typeof id === "string" && (APP_VOICE_SCREENS as readonly string[]).includes(id);
}
