import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { syncPhotos } from "../../src/tools/sync-photos";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "sync-photos-"));
  const dir = join(root, "content/characters/c1");
  mkdirSync(join(dir, "photos"), { recursive: true });
  mkdirSync(join(dir, "sns"), { recursive: true });
  mkdirSync(join(root, ".data/photos/c1"), { recursive: true });
  const row = (id: string) => ({ id, blob_url: `.data/photos/c1/${id}.jpg`, situation: "s", time_of_day: "noon", place: "p", face: false, audience: "private", used: [] });
  writeFileSync(join(dir, "photos/manifest.jsonl"), [row("c1-p001"), row("c1-p002")].map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(root, ".data/photos/c1/c1-p001.jpg"), "x");
  const q = { date: "2026-11-17", slides: [{ photo_tag: "a", photo_id: "c1-p001" }, { photo_tag: "b", photo_id: "c1-p002" }] };
  writeFileSync(join(dir, "sns/queue.jsonl"), JSON.stringify({ _schema: "queue-v1" }) + "\n" + JSON.stringify(q) + "\n");
  return { root, dir };
}
const lines = (p: string) => readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l));

it("dry-run은 파일을 바꾸지 않는다", () => {
  const { root, dir } = setup();
  const before = readFileSync(join(dir, "photos/manifest.jsonl"), "utf8");
  expect(syncPhotos({ root, today: "2026-11-14", dryRun: true })).toEqual([{ character: "c1", rejected: 1, restored: 0, queue: 1 }]);
  expect(readFileSync(join(dir, "photos/manifest.jsonl"), "utf8")).toBe(before);
});

it("없는 파일은 폐기, 있는 파일은 유지, 큐 슬라이드는 null+_missing", () => {
  const { root, dir } = setup();
  expect(syncPhotos({ root, today: "2026-11-14" })).toEqual([{ character: "c1", rejected: 1, restored: 0, queue: 1 }]);
  const m = lines(join(dir, "photos/manifest.jsonl"));
  expect(m[0].used).toEqual([]);
  expect(m[1].used).toEqual([{ where: "rejected", at: "2026-11-14", reason: "deleted_by_reviewer" }]);
  const q = lines(join(dir, "sns/queue.jsonl"));
  expect(q[0]).toEqual({ _schema: "queue-v1" });
  expect(q[1].slides[0].photo_id).toBe("c1-p001");
  expect(q[1].slides[1]).toMatchObject({ photo_id: null, _missing: true });
  // 재실행은 멱등
  expect(syncPhotos({ root, today: "2026-11-15" })).toEqual([{ character: "c1", rejected: 0, restored: 0, queue: 0 }]);
});

it("deleted_by_reviewer로만 폐기된 행은 파일이 돌아오면 복구된다", () => {
  const { root, dir } = setup();
  syncPhotos({ root, today: "2026-11-14" });
  writeFileSync(join(root, ".data/photos/c1/c1-p002.jpg"), "x");
  expect(syncPhotos({ root, today: "2026-11-15" })[0]).toMatchObject({ rejected: 0, restored: 1 });
  expect(lines(join(dir, "photos/manifest.jsonl"))[1].used).toEqual([]);
});
