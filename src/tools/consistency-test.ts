// W5b 일관성 테스트: 참조 1장으로 n장을 생성해 검수자가 "같은 사람" 판정(8/10 이상)을 하게 한다.
// 사용: node --import tsx src/tools/consistency-test.ts --character ihan --ref <경로|URL> --n 10 [--provider gateway|fal|mock] [--ids p001,p002] [--model <id>] [--label <dir접미>] [--dry-run]
// 상황은 content/characters/<id>/photos/plan.jsonl의 priority 1 행에서 앞에서부터 고른다. 결과는 .data/photos/consistency/<id>/(gitignore).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { activeImageProvider, defaultModel, estimateImageCostUsd, generateImage } from "../img/index.js";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };

function refToUrl(ref: string): string {
  if (/^(https?|data):/.test(ref)) return ref;
  const mime = MIME[extname(ref).toLowerCase()];
  if (!mime) throw new Error(`참조 이미지 확장자 미지원: ${ref}`);
  return `data:${mime};base64,${readFileSync(ref).toString("base64")}`;
}

type Row = { id: string; situation: string; place: string; prompt_hint: string; aspect?: string; priority?: number };

async function main() {
  const id = arg("character");
  const ref = arg("ref");
  const n = Number(arg("n", "10"));
  const dry = process.argv.includes("--dry-run");
  if (!id || !/^[a-z]+$/.test(id)) throw new Error("--character <id> 필요");
  if (!ref) throw new Error("--ref <경로|URL> 필요");
  const prov = arg("provider");
  if (prov) {
    if (prov !== "gateway" && prov !== "fal" && prov !== "mock") throw new Error("--provider gateway|fal|mock");
    process.env.IMG_PROVIDER = prov;
  }

  const all: Row[] = readFileSync(join("content/characters", id, "photos/plan.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => r.id);
  const ids = arg("ids")?.split(",");
  const rows = ids ? all.filter((r) => ids.includes(r.id)) : all.filter((r) => r.priority === 1).slice(0, n);
  if (rows.length < n) console.log(`priority 1 행이 ${rows.length}개뿐이라 ${rows.length}장만 만든다`);

  const provider = activeImageProvider();
  const model = arg("model") ?? defaultModel(provider, true);
  const est = rows.length * estimateImageCostUsd(provider, model, true);
  console.log(`${id}: ${rows.length}장, 공급자 ${provider}, 모델 ${model}, 예상 비용 $${est.toFixed(3)}`);
  const age = id === "isol" ? 23 : 21;
  const wear = id === "isol" ? " Casual top covering shoulders and waist, female." : "";
  const promptOf = (r: Row) =>
    `Photo of the same person as the reference, same face and hair; keep the exact same hair color (dark brown/black) and hairstyle as the reference; no brand logos or text on clothing; K-pop idol trainee, ${age}-year-old adult. ${r.prompt_hint}. Setting: ${r.place}.${wear}`;
  if (dry) {
    for (const r of rows) console.log(`[${r.id}] ${promptOf(r)}`);
    return;
  }

  const refUrl = refToUrl(ref);
  const dir = join(".data/photos/consistency", id + (arg("label") ? `-${arg("label")}` : ""));
  mkdirSync(dir, { recursive: true });
  const log = join(dir, "results.jsonl");
  writeFileSync(log, "");
  let spent = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const out = await generateImage({ prompt: promptOf(r), aspect: r.aspect, referenceImages: [refUrl], model });
      spent += out.costUsd;
      const path = join(dir, `${r.id}.${out.ext}`);
      writeFileSync(path, out.bytes);
      appendFileSync(log, JSON.stringify({ id: r.id, situation: r.situation, path: `/Users/gim-yeonho/v/date/${path}`, model: out.model, created_at: new Date().toISOString() }) + "\n");
      console.log(`ok ${r.id}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${r.id}: ${(e as Error).message}`);
    }
  }
  console.log(`${id} 완료. 실패 ${failed}, 추정 비용 $${spent.toFixed(3)}. 검수자 판정은 docs/ops/face-selection.md "일관성 테스트" 칸에 기록`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
