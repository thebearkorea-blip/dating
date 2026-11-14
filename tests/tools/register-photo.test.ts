import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { registerPhoto } from "../../src/tools/register-photo";

const FFMPEG = "/opt/homebrew/bin/ffmpeg";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "regphoto-"));
  mkdirSync(join(root, "content/characters/c1/photos"), { recursive: true });
  writeFileSync(
    join(root, "content/characters/c1/photos/plan.jsonl"),
    JSON.stringify({ id: "c1-p1", situation: "dog", time_of_day: "morning", place: "river", face: true, audience: "public", aspect: "4:5" }) + "\n",
  );
  execFileSync(FFMPEG, ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=2000x1000", "-frames:v", "1", join(root, "in.jpg")]);
  return root;
}
const manifest = (root: string) =>
  readFileSync(join(root, "content/characters/c1/photos/manifest.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

it("register-photo: 등록 시 파일 복사(1600px)·행 필드, 재등록 시 교체", () => {
  const root = setup();
  const base = { root, character: "c1", id: "c1-p1", file: "in.jpg", source: "stock" as const };
  const r = registerPhoto({ ...base, credit: "u / Pixabay", license: "L", sourceUrl: "https://x", model: "m" });
  expect(r.replaced).toBe(false);
  expect(existsSync(join(root, ".data/photos/c1/c1-p1.jpg"))).toBe(true);
  const row = manifest(root)[0];
  expect(row).toMatchObject({ id: "c1-p1", situation: "dog", place: "river", face: true, audience: "public", source: "stock", credit: "u / Pixabay", license: "L", source_url: "https://x", model: "m", used: [] });
  const r2 = registerPhoto({ ...base, credit: "v / Pixabay" });
  expect(r2.replaced).toBe(true);
  expect(manifest(root)).toHaveLength(1);
  expect(manifest(root)[0].credit).toBe("v / Pixabay");
});
