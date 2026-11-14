// 사용법: node --env-file=.data/tmp/env.prod --import tsx src/tools/blob-upload-photos.ts --character ihan [--dry-run] [--force] [--ids a,b]
// 매니페스트의 적재 대상 사진(load-content 조건과 동일)을 Vercel Blob에 올리고 행에 public_url을 기록한다.
// 토큰은 환경변수 BLOB_READ_WRITE_TOKEN. blob_url(로컬 경로)은 바꾸지 않는다.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Row = { id: string; blob_url: string; public_url?: string; face: boolean; source?: string; used: Array<{ where: string }> };

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const character = opt("--character");
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const ids = opt("--ids")?.split(",").filter(Boolean);
if (!character) throw new Error("--character 필요");
if (!dryRun && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN 환경변수가 없다(--env-file=.data/tmp/env.prod 확인)");

const root = process.cwd();
const manifestPath = join(root, "content/characters", character, "photos/manifest.jsonl");
const lines = readFileSync(manifestPath, "utf8").split("\n");

const isTarget = (r: Row) => !r.used.some((u) => u.where === "rejected") && (r.face === true || r.source !== "ai");

// CLI는 OIDC(VERCEL_OIDC_TOKEN+BLOB_STORE_ID)와 rw 토큰 중 하나만 허용한다. env.prod에는 OIDC 토큰만 섞여 있으므로 빼고 rw 토큰을 쓴다.
const cliEnv = { ...process.env };
delete cliEnv.VERCEL_OIDC_TOKEN;
delete cliEnv.BLOB_STORE_ID;

let uploaded = 0;
let skipped = 0;
let failed = 0;
const targets: string[] = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i] ?? "";
  if (!line.trim()) continue;
  const row = JSON.parse(line) as Row;
  if (!isTarget(row)) continue;
  if (ids && !ids.includes(row.id)) continue;
  if (row.public_url && !force) {
    console.log(`skip ${row.id} (이미 public_url 있음)`);
    skipped++;
    continue;
  }
  targets.push(row.id);
  if (dryRun) continue;
  const file = resolve(root, row.blob_url);
  if (!existsSync(file)) {
    console.warn(`skip ${row.id} (파일 없음: ${file})`);
    skipped++;
    continue;
  }
  try {
    // CLI는 성공 메시지를 stderr로 내므로 stdout+stderr를 합쳐 읽는다.
    const res = spawnSync(
      "vercel",
      ["blob", "put", file, "--access", "public", "--add-random-suffix", "--pathname", `photos/${character}/${row.id}.jpg`, "--cwd", root],
      { env: cliEnv, encoding: "utf8" },
    );
    if (res.status !== 0) throw new Error(`vercel blob put 실패(${res.status}): ${(res.stderr || res.stdout).trim().slice(0, 300)}`);
    const out = `${res.stdout}\n${res.stderr}`;
    const url = /https:\/\/[^\s"']+\.public\.blob\.vercel-storage\.com\/[^\s"']+/.exec(out)?.[0];
    if (!url) throw new Error(`URL을 찾지 못함: ${out.trim().slice(0, 200)}`);
    // 필드 순서 보존: public_url을 blob_url 바로 뒤에 둔다
    const ordered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "public_url") continue;
      ordered[k] = v;
      if (k === "blob_url") ordered.public_url = url;
    }
    lines[i] = JSON.stringify(ordered);
    writeFileSync(manifestPath, lines.join("\n"));
    console.log(`ok ${row.id} ${url}`);
    uploaded++;
  } catch (e) {
    console.error(`fail ${row.id} ${(e as Error).message}`);
    failed++;
  }
}
if (dryRun) {
  console.log(`[dry-run] 대상 ${targets.length}장: ${targets.join(", ")}`);
} else {
  console.log(`업로드 ${uploaded}, 건너뜀 ${skipped}, 실패 ${failed}`);
}
