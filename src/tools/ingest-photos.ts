// 사용자 실사진 수집: 폴더의 jpg/png/heic -> EXIF 제거 + 긴 변 1600px -> .data/photos/<c>/own-<n>.jpg + manifest 행(source:"own").
// 사용: node --import tsx src/tools/ingest-photos.ts --character ihan --dir .data/photos/own/ihan [--situation <slug>] [--place <장소>] [--dry-run]
// situation: --situation 이 없으면 파일명 `convenience-store-night__01.jpg`의 `__` 앞부분(slug). 없으면 파일명 전체.
// time_of_day: EXIF 촬영 시각(ffprobe)으로 추정, 없으면 "unknown". 같은 파일(sha1)은 .data/photos/<c>/own-index.json으로 중복 방지.
// 이미지 파일은 .data/(gitignore). heic는 `sips -s format jpeg`로 변환하며 실패하면 건너뛴다.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { photoRowSchema } from "../content/schemas/photos.js";

const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";
const EXTS = new Set([".jpg", ".jpeg", ".png", ".heic"]);

export type IngestOpts = { root: string; character: string; dir: string; situation?: string; place?: string; dryRun?: boolean };
export type IngestResult = { added: string[]; duplicates: string[]; skipped: string[] };

export function hourToTimeOfDay(h: number): string {
  if (h < 4) return "late_night";
  if (h < 7) return "dawn";
  if (h < 11) return "morning";
  if (h < 14) return "noon";
  if (h < 18) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

/** EXIF 촬영 시각 -> time_of_day. 못 읽으면 "unknown". */
function timeOfDayOf(file: string): string {
  try {
    const out = execFileSync(FFPROBE, ["-v", "quiet", "-print_format", "json", "-show_entries", "format_tags:stream_tags", file], { encoding: "utf8" });
    const tags = JSON.stringify(JSON.parse(out));
    const m = /(?:DateTimeOriginal|creation_time)"\s*:\s*"[^"]*?[T ](\d{2}):\d{2}:\d{2}/.exec(tags);
    return m ? hourToTimeOfDay(Number(m[1])) : "unknown";
  } catch {
    return "unknown";
  }
}

/** EXIF 제거 + 긴 변 1600px 이하로 축소(확대 안 함). ffmpeg는 EXIF 회전을 적용하고 메타데이터를 버린다. */
function cleanJpeg(src: string, dst: string): void {
  const vf = "scale=w='if(gt(iw,ih),min(1600,iw),-2)':h='if(gt(iw,ih),-2,min(1600,ih))'";
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", src, "-map_metadata", "-1", "-vf", vf, "-frames:v", "1", "-q:v", "3", dst]);
}

export function ingestPhotos(o: IngestOpts): IngestResult {
  const dir = resolve(o.root, o.dir);
  const outDir = join(o.root, ".data/photos", o.character);
  const manifest = join(o.root, "content/characters", o.character, "photos/manifest.jsonl");
  const indexPath = join(outDir, "own-index.json");
  const index: Record<string, string> = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : {};
  const used = new Set(Object.values(index));
  const nextN = () => {
    let n = 1;
    while (used.has(`own-${n}`) || existsSync(join(outDir, `own-${n}.jpg`))) n++;
    used.add(`own-${n}`);
    return n;
  };
  const res: IngestResult = { added: [], duplicates: [], skipped: [] };
  const tmp = mkdtempSync(join(tmpdir(), "ingest-"));
  try {
    const files = readdirSync(dir).filter((f) => EXTS.has(extname(f).toLowerCase())).sort();
    for (const f of files) {
      const src = join(dir, f);
      const hash = createHash("sha1").update(readFileSync(src)).digest("hex");
      if (index[hash]) {
        res.duplicates.push(f);
        continue;
      }
      const stem = basename(f, extname(f));
      const situation = o.situation ?? stem.split("__")[0];
      let input = src;
      if (extname(f).toLowerCase() === ".heic") {
        input = join(tmp, `${stem}.jpg`);
        try {
          execFileSync("sips", ["-s", "format", "jpeg", src, "--out", input], { stdio: "ignore" });
        } catch {
          res.skipped.push(`${f} (heic 변환 실패)`);
          continue;
        }
      }
      const tod = timeOfDayOf(input);
      const n = nextN();
      const id = `${o.character}-own-${n}`;
      const path = `.data/photos/${o.character}/own-${n}.jpg`;
      if (!o.dryRun) {
        mkdirSync(outDir, { recursive: true });
        try {
          cleanJpeg(input, join(o.root, path));
        } catch {
          used.delete(`own-${n}`);
          res.skipped.push(`${f} (변환 실패)`);
          continue;
        }
        const row = photoRowSchema.parse({ id, blob_url: path, situation, time_of_day: tod, place: o.place ?? "unknown", face: false, audience: "public", source: "own", used: [] });
        mkdirSync(join(manifest, ".."), { recursive: true });
        appendFileSync(manifest, JSON.stringify(row) + "\n");
        index[hash] = `own-${n}`;
        writeFileSync(indexPath, JSON.stringify(index, null, 1));
      } else {
        index[hash] = `own-${n}`; // 같은 폴더 안 중복도 dry-run에서 보이게(파일은 안 씀)
      }
      res.added.push(`${f} -> ${path} (${situation}, ${tod})`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return res;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const character = arg("character");
  const dir = arg("dir");
  if (!character || !/^[a-z]+$/.test(character)) throw new Error("--character <id> 필요");
  if (!dir || !existsSync(dir)) throw new Error("--dir <폴더> 필요(존재해야 함)");
  const dryRun = process.argv.includes("--dry-run");
  const r = ingestPhotos({ root: process.cwd(), character, dir, situation: arg("situation"), place: arg("place"), dryRun });
  for (const a of r.added) console.log(`${dryRun ? "[dry-run] " : ""}추가 ${a}`);
  for (const d of r.duplicates) console.log(`중복 건너뜀 ${d}`);
  for (const s of r.skipped) console.log(`건너뜀 ${s}`);
  console.log(`${character}: 추가 ${r.added.length}, 중복 ${r.duplicates.length}, 건너뜀 ${r.skipped.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    main();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
