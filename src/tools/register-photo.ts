// 합성·실사진·스톡 사진을 plan 행(id)에 등록한다: 파일 -> .data/photos/<c>/<id>.jpg(EXIF 제거, 긴 변 1600px 이하), manifest 행 교체/추가.
// 사용: node --import tsx src/tools/register-photo.ts --character ihan --id ihan-p106 --file <경로> --source stock|own [--credit "<user> / Pixabay"] [--license "Pixabay Content License"] [--source-url <url>] [--model bfl/flux-2-pro] [--note "composite"] [--dry-run]
// situation/time_of_day/place/face/audience는 plan.jsonl의 같은 id 행에서 가져온다. 같은 id 행이 manifest에 있으면 교체, 없으면 추가. used는 [].
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { photoRowSchema } from "../content/schemas/photos.js";

const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";

export type RegisterOpts = {
  root: string;
  character: string;
  id: string;
  file: string;
  source: "stock" | "own";
  credit?: string;
  license?: string;
  sourceUrl?: string;
  model?: string;
  note?: string;
  dryRun?: boolean;
};
export type RegisterResult = { path: string; replaced: boolean; aspect?: string };

export function registerPhoto(o: RegisterOpts): RegisterResult {
  const planPath = join(o.root, "content/characters", o.character, "photos/plan.jsonl");
  const manifest = join(o.root, "content/characters", o.character, "photos/manifest.jsonl");
  const plan = existsSync(planPath)
    ? readFileSync(planPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.id === o.id)
    : undefined;
  if (!plan) throw new Error(`plan.jsonl에 ${o.id} 행이 없다`);
  const src = resolve(o.root, o.file);
  if (!existsSync(src)) throw new Error(`파일 없음: ${src}`);

  const path = `.data/photos/${o.character}/${o.id}.jpg`;
  const prevLine = existsSync(manifest) ? readFileSync(manifest, "utf8").split("\n").find((l) => l.trim() && JSON.parse(l).id === o.id) : undefined;
  const prevPublicUrl: string | undefined = prevLine ? JSON.parse(prevLine).public_url : undefined;
  const row = photoRowSchema.parse({
    id: o.id,
    blob_url: path,
    ...(prevPublicUrl ? { public_url: prevPublicUrl } : {}),
    situation: plan.situation,
    time_of_day: plan.time_of_day,
    place: plan.place,
    face: plan.face,
    audience: plan.audience,
    source: o.source,
    ...(o.license ? { license: o.license } : {}),
    ...(o.credit ? { credit: o.credit } : {}),
    ...(o.sourceUrl ? { source_url: o.sourceUrl } : {}),
    ...(o.model ? { model: o.model } : {}),
    used: [],
  });
  const lines = existsSync(manifest) ? readFileSync(manifest, "utf8").split("\n").filter(Boolean) : [];
  const idx = lines.findIndex((l) => JSON.parse(l).id === o.id);
  const replaced = idx >= 0;
  if (!o.dryRun) {
    mkdirSync(join(o.root, ".data/photos", o.character), { recursive: true });
    const vf = "scale=w='if(gt(iw,ih),min(1600,iw),-2)':h='if(gt(iw,ih),-2,min(1600,ih))'";
    execFileSync(FFMPEG, ["-y", "-v", "error", "-i", src, "-map_metadata", "-1", "-vf", vf, "-frames:v", "1", "-q:v", "3", join(o.root, path)]);
    if (replaced) lines[idx] = JSON.stringify(row);
    else lines.push(JSON.stringify(row));
    mkdirSync(join(manifest, ".."), { recursive: true });
    writeFileSync(manifest, lines.join("\n") + "\n");
  }
  return { path, replaced, aspect: plan.aspect };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const character = arg("character");
  const id = arg("id");
  const file = arg("file");
  const source = arg("source");
  if (!character || !/^[a-z]+$/.test(character)) throw new Error("--character <id> 필요");
  if (!id || !file) throw new Error("--id, --file 필요");
  if (source !== "stock" && source !== "own") throw new Error("--source stock|own");
  const dryRun = process.argv.includes("--dry-run");
  const r = registerPhoto({
    root: process.cwd(), character, id, file, source, dryRun,
    credit: arg("credit"), license: arg("license"), sourceUrl: arg("source-url"), model: arg("model"), note: arg("note"),
  });
  console.log(`${dryRun ? "[dry-run] " : ""}${r.replaced ? "교체" : "추가"} ${id} -> ${r.path} (aspect ${r.aspect ?? "?"})`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    main();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
