import { describe, expect, it } from "vitest";
import { APP_VOICE_SCREENS, isAppVoiceScreen } from "../../src/engine/app-voice";

describe("app-voice", () => {
  it("흰 목록 id만 통과하는 타입 가드", () => {
    for (const id of APP_VOICE_SCREENS) expect(isAppVoiceScreen(id)).toBe(true);
    expect(isAppVoiceScreen("chat_ad")).toBe(false);
    expect(isAppVoiceScreen(undefined)).toBe(false);
  });
});
