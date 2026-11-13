// 장면 대본(content/characters/<id>/scenes/*.md) 로더. frontmatter의 trigger 값을 그대로 읽는다.
// 본문은 `---` 줄로 말풍선을 나누고, 끝의 <!-- notes --> 주석은 버린다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { splitFrontmatter } from "../content/schemas/diary.js";

export interface Scene {
  id: string;
  trigger: string;
  stageMin: number;
  confirmLine: string | null;
  bubbles: string[];
}

export function parseScene(raw: string): Scene | null {
  const fm = splitFrontmatter(raw);
  if (!fm || typeof fm.data !== "object" || fm.data === null) return null;
  const d = fm.data as Record<string, unknown>;
  if (typeof d.id !== "string" || typeof d.trigger !== "string") return null;
  const body = fm.body.replace(/<!--[\s\S]*?-->/g, "");
  const bubbles = body
    .split(/^---\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean);
  return {
    id: d.id,
    trigger: d.trigger,
    stageMin: typeof d.stage_min === "number" ? d.stage_min : 1,
    confirmLine: typeof d.confirm_line === "string" ? d.confirm_line : null,
    bubbles,
  };
}

export function loadScenes(characterId: string, root = "content"): Scene[] {
  const dir = join(root, "characters", characterId, "scenes");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((n) => parseScene(readFileSync(join(dir, n), "utf8")))
    .filter((s): s is Scene => s !== null);
}

/** trigger가 같은 장면들(id 순). */
export function scenesByTrigger(characterId: string, trigger: string, root = "content"): Scene[] {
  return loadScenes(characterId, root).filter((s) => s.trigger === trigger);
}
