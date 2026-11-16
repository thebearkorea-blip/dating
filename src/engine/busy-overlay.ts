// LLM 없이 나가는 "그의 사정" 문장 풀. 문장은 캐릭터 콘텐츠(content/characters/<id>/lines.yaml)에 있다.
// 한도·결제·사과 표현을 쓰지 않는다(C5·VOICE-app-system). 출시 전 검수 대상.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { LINE_LANGS, linesSchema, type Lines } from "../content/schemas/lines.js";
import { getCharacterId, getLang } from "../product/index.js";
import { hash32 } from "./schedule.js";

export type Lang = "ko" | "en" | "ja";

const linesCache = new Map<string, Lines>();
/** 캐릭터 고정 문장(1회 캐시). 기본: 현재 제품의 캐릭터. */
export function characterLines(characterId: string = getCharacterId(), root = "content"): Lines {
  const key = `${root}:${characterId}`;
  let l = linesCache.get(key);
  if (!l) {
    l = linesSchema.parse(parseYaml(readFileSync(join(root, "characters", characterId, "lines.yaml"), "utf8")));
    linesCache.set(key, l);
  }
  return l;
}

/** 언어별 값에서 lang → 제품 기본 언어 → 첫 언어 순으로 고른다. */
export function forLang<T>(byLang: Partial<Record<Lang, T>>, lang: Lang): T {
  const v = byLang[lang] ?? byLang[getLang()] ?? LINE_LANGS.map((l) => byLang[l]).find((x) => x !== undefined);
  if (v === undefined) throw new Error("언어 풀 없음");
  return v;
}

/** 한글(가-힣)이 있으면 "ko", 가나가 있으면 "ja", 둘 다 없으면 제품 기본 언어(us "en", jp "ja"). */
export function langOf(text: string, fallback: Lang = getLang()): Lang {
  if (/[가-힣]/.test(text)) return "ko";
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "ja";
  return fallback;
}

function pick(pool: readonly string[], seed: string): string {
  return pool[hash32(seed) % pool.length] as string;
}

export function pickUnavailable(seed: string, lang: Lang = "en", characterId?: string): string {
  return pick(forLang(characterLines(characterId).unavailable, lang), seed);
}

/** seed가 같으면 같은 문장. */
export function pickBusyOverlay(seed: string, lang: Lang = "en", characterId?: string): string {
  return pick(forLang(characterLines(characterId).busy_overlay, lang), seed);
}

/** 출력 가드 폴백 풀(언어별). */
export function fallbackPool(lang: Lang, characterId?: string): readonly string[] {
  return forLang(characterLines(characterId).fallback, lang);
}

/** 한도를 쓰지 않은 답장 문장 전부(한도 소진 오버레이·LLM 실패 문장, 모든 언어). 연속 메시지 환불 판정용. */
export function freeLines(characterId?: string): Set<string> {
  const l = characterLines(characterId);
  const out = new Set<string>();
  for (const pools of [l.busy_overlay, l.unavailable]) for (const lang of LINE_LANGS) for (const s of pools[lang] ?? []) out.add(s);
  return out;
}
