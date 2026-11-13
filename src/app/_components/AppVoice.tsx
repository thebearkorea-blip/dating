import type { ReactNode } from "react";
import { type AppVoiceScreen, isAppVoiceScreen } from "@/engine/app-voice";

/** 앱 목소리(캐릭터가 아닌 시스템 문구) 박스. 흰 목록의 화면 id가 있어야만 쓸 수 있다. */
export function AppVoice({ screen, children }: { screen: AppVoiceScreen; children: ReactNode }) {
  if (!isAppVoiceScreen(screen)) throw new Error(`앱 목소리 화면 id가 아님: ${String(screen)}`);
  return (
    <div role="note" data-app-voice={screen} className="app-voice">
      {children}
    </div>
  );
}
