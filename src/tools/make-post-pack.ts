// 사용법: node --import tsx src/tools/make-post-pack.ts --character ihan --date 2026-11-17 [--platform tiktok|instagram|all] [--all-dates] [--dry-run]
// 큐(content/characters/<c>/sns/queue.jsonl)에서 수동 게시용 "게시 팩"을 .data/sns/<c>/<date>/<platform>/ 에 만든다.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FONTS = ["/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "/System/Library/Fonts/AppleSDGothicNeo.ttc"];
const W = 1080;
const H = 1350;
const FONT_SIZE = 56;
const MAX_UNITS = 28; // 한글=2, 그 외=1 (가로 안전영역 안)
const BOTTOM_MARGIN = 220; // 플랫폼 UI 가림 방지

export interface QueueRow {
  date: string;
  platform: string;
  caption: string;
  hashtags: string[];
  slides: { photo_tag?: string; text_overlay?: string; photo_id: string | null }[];
  post_time_kst: string;
}

export interface PackResult {
  date: string;
  platform: string;
  dir: string;
  slides: number;
  warnings: string[];
}

export const AI_LABEL_CHECKLIST = [
  "게시 화면에서 AI 라벨(AI-generated content) 켜기 — 틱톡: More options → AI-generated content / 인스타: AI 공개 도구, 프로필 AI 토글 확인",
  "프로필 AI 표기 확인(docs/ops/sns-rules.md §1-3)",
  "post_time_kst 시각에 수동 게시",
];

export function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

function units(s: string): number {
  let n = 0;
  for (const ch of s) n += /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3040-\u30ff\u4e00-\u9fff]/.test(ch) ? 2 : 1;
  return n;
}

export function wrapText(text: string, max = MAX_UNITS): string {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && units(next) > max) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

function pickFont(): string {
  const f = FONTS.find((p) => existsSync(p));
  if (!f) throw new Error("한글/영문 시스템 폰트를 찾지 못함");
  return f;
}

// 이 머신의 ffmpeg 9에는 drawtext(libfreetype)가 없어, 텍스트 띠는 Pillow로 투명 PNG를 그려 ffmpeg overlay로 합성한다.
const PIL_SCRIPT = `
import sys
from PIL import Image, ImageDraw, ImageFont
out, font, tf, W, H, size, margin = sys.argv[1], sys.argv[2], sys.argv[3], *map(int, sys.argv[4:8])
text = open(tf, encoding="utf-8").read()
f = ImageFont.truetype(font, size)
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
sp = 12
box = d.multiline_textbbox((0, 0), text, font=f, spacing=sp, align="center")
tw, th, pad = box[2] - box[0], box[3] - box[1], 28
x0, y1 = (W - tw) // 2, H - margin
d.rectangle((x0 - pad, y1 - th - 2 * pad, x0 + tw + pad, y1), fill=(0, 0, 0, 140))
d.multiline_text((x0 - box[0], y1 - th - pad - box[1]), text, font=f, fill=(255, 255, 255, 255), spacing=sp, align="center")
img.save(out)
`;

export function hasPillow(): boolean {
  try {
    execFileSync("python3", ["-c", "import PIL"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function renderSlide(src: string, out: string, overlay: string | undefined, tmp: string): void {
  const base = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
  const args = ["-y", "-loglevel", "error", "-i", src];
  if (overlay?.trim()) {
    const id = Math.random().toString(36).slice(2);
    const tf = join(tmp, `t-${id}.txt`);
    const png = join(tmp, `o-${id}.png`);
    writeFileSync(tf, wrapText(overlay.trim()));
    execFileSync("python3", ["-c", PIL_SCRIPT, png, pickFont(), tf, String(W), String(H), String(FONT_SIZE), String(BOTTOM_MARGIN)]);
    args.push("-i", png, "-filter_complex", `[0:v]${base}[b];[b][1:v]overlay=0:0`);
  } else args.push("-vf", base);
  execFileSync(FFMPEG, [...args, "-frames:v", "1", "-update", "1", "-q:v", "2", out]);
}

export interface PackOptions {
  root: string; // 저장소 루트
  character: string;
  outRoot?: string; // 기본 <root>/.data/sns
  dryRun?: boolean;
  blocked?: Map<string, string>; // 얼굴 없는 AI 컷(사용 제외): photo_id -> situation
}

export function makePack(row: QueueRow, photos: Map<string, string>, opt: PackOptions): PackResult {
  const dir = join(opt.outRoot ?? join(opt.root, ".data/sns"), opt.character, row.date, row.platform);
  const warnings: string[] = [];
  const todo: { src: string; overlay?: string; id: string }[] = [];
  row.slides.forEach((s, i) => {
    const tag = `${row.date}/${row.platform} 슬라이드 ${i + 1}`;
    if (!s.photo_id) return void warnings.push(`${tag}: photo_id 없음 — 건너뜀`);
    const rel = photos.get(s.photo_id);
    const need = opt.blocked?.get(s.photo_id);
    if (need !== undefined) return void warnings.push(`${tag}: ⚠ 실사진 필요: ${need}`);
    const src = rel ? resolve(opt.root, rel) : "";
    if (!rel || !existsSync(src)) return void warnings.push(`${tag}: ${s.photo_id} 파일 없음 — 건너뜀`);
    todo.push({ src, overlay: s.text_overlay, id: s.photo_id });
  });
  const res: PackResult = { date: row.date, platform: row.platform, dir, slides: todo.length, warnings };
  if (todo.length === 0) {
    res.warnings.push(`${row.date}/${row.platform}: 슬라이드 0장 — 팩 미생성`);
    return res;
  }
  if (opt.dryRun) return res;
  mkdirSync(dir, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), "postpack-"));
  try {
    todo.forEach((t, i) => renderSlide(t.src, join(dir, `slide-${String(i + 1).padStart(2, "0")}.jpg`), t.overlay, tmp));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  writeFileSync(join(dir, "caption.txt"), `${row.caption}\n\n${row.hashtags.join(" ")}\n`);
  writeFileSync(
    join(dir, "meta.json"),
    JSON.stringify(
      { character: opt.character, date: row.date, platform: row.platform, post_time_kst: row.post_time_kst, ai_label: true, photo_ids: todo.map((t) => t.id), checklist: AI_LABEL_CHECKLIST },
      null,
      2,
    ) + "\n",
  );
  return res;
}

function main() {
  const { values } = parseArgs({
    options: {
      character: { type: "string" },
      date: { type: "string" },
      platform: { type: "string", default: "all" },
      "all-dates": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const c = values.character;
  if (!c || (!values.date && !values["all-dates"])) {
    console.error("사용법: make-post-pack --character <c> (--date YYYY-MM-DD | --all-dates) [--platform tiktok|instagram|all] [--dry-run]");
    process.exit(1);
  }
  const root = process.cwd();
  const rows = readJsonl<QueueRow & { _schema?: string }>(join(root, "content/characters", c, "sns/queue.jsonl")).filter((r) => !r._schema && r.date);
  const manifest = readJsonl<{ id: string; blob_url: string; situation: string; face: boolean; source?: string }>(join(root, "content/characters", c, "photos/manifest.jsonl"));
  const isFacelessAi = (p: { face: boolean; source?: string }) => !p.face && (p.source ?? "ai") === "ai"; // 결정 2026-11-14
  const photos = new Map(manifest.filter((p) => !isFacelessAi(p)).map((p) => [p.id, p.blob_url]));
  const blocked = new Map(manifest.filter(isFacelessAi).map((p) => [p.id, p.situation]));
  const sel = rows.filter((r) => (values["all-dates"] || r.date === values.date) && (values.platform === "all" || r.platform === values.platform));
  if (sel.length === 0) {
    console.error("해당 조건의 큐 행이 없음");
    process.exit(1);
  }
  const warnings: string[] = [];
  for (const row of sel) {
    const r = makePack(row, photos, { root, character: c, dryRun: values["dry-run"], blocked });
    warnings.push(...r.warnings);
    console.log(`${values["dry-run"] ? "[dry-run] " : ""}${r.date} ${r.platform}: ${r.slides}장 -> ${r.dir}`);
  }
  if (warnings.length) console.log(`\n경고 ${warnings.length}건\n${warnings.map((w) => `- ${w}`).join("\n")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
