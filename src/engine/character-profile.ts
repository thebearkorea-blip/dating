// 캐릭터 프로필 문구(lines.yaml profile). 제품 화면 언어의 값이 있으면 그것, 없으면 호출자의 기존 값.
import type { LineProfile } from "../content/schemas/lines.js";
import { getLang, getStrings } from "../product/index.js";
import { characterLines } from "./busy-overlay.js";

export function characterProfile(characterId?: string): LineProfile | undefined {
  return characterLines(characterId).profile?.[getLang()];
}

/** 헤더·프로필·푸시에 보일 캐릭터 이름. 프로필 → DB 이름 → 제품 기본 이름. */
export function characterName(dbName: string | null | undefined, characterId?: string): string {
  return characterProfile(characterId)?.display_name || dbName || getStrings()["character.fallbackName"];
}
