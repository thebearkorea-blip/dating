// W5b~c LoRA 학습용 참조 생성: 정면 참조 1장으로 n장(기본 30)을 Gateway 참조 편집으로 만든다.
// 사용: node --import tsx src/tools/lora-refs.ts --character ihan --ref <경로|URL> --n 30 [--model bfl/flux-2-pro] [--dry-run]
//       node --import tsx src/tools/lora-refs.ts --character ihan --keep 01,03,05 [--dry-run]   (검수 통과분만 zip: <id>-refs.zip)
// 결과 .data/photos/lora-refs/<id>/NN.jpg + refs.jsonl (gitignore). 이어하기: 이미 있는 NN은 건너뛴다.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, resolve } from "node:path";
import { estimateImageCostUsd, generateImage } from "../img/index.js";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
function refToUrl(ref: string): string {
  if (/^(https?|data):/.test(ref)) return ref;
  const mime = MIME[extname(ref).toLowerCase()];
  if (!mime) throw new Error(`참조 이미지 확장자 미지원: ${ref}`);
  return `data:${mime};base64,${readFileSync(ref).toString("base64")}`;
}

// 6 시점 x 7 표정 x 5 조명 x 4 옷을 서로소 주기로 섞어 30장이 겹치지 않게 한다.
const VIEWS = [
  "facing the camera straight on",
  "head turned about 45 degrees to the left",
  "head turned about 45 degrees to the right",
  "full left side profile",
  "full right side profile",
  "facing the camera, chin slightly down",
];
const EXPRS = ["neutral relaxed expression", "gentle closed-mouth smile", "wide natural smile showing teeth", "serious calm expression", "soft laugh with eyes crinkled", "slightly tired expressionless face", "mild surprised look"];
const LIGHTS = ["soft even studio light", "warm window light from the side", "cool daylight, overcast", "dim warm indoor light", "bright flat softbox light"];
const OUTFITS = ["plain white t-shirt", "plain black crewneck sweatshirt", "gray hoodie with no print", "navy button-up shirt"];

function promptOf(i: number): string {
  return `Photo of the same person as the reference: same person, same hair color/style, no logos or text on clothing. ${VIEWS[i % 6]}, ${EXPRS[i % 7]}, ${LIGHTS[i % 5]}, wearing a ${OUTFITS[i % 4]}. Plain simple background, face large in frame, head and shoulders, sharp focus, photorealistic.`;
}

function makeZip(id: string, dir: string, keep: string[], dry: boolean) {
  const files = keep.map((k) => {
    const f = readdirSync(dir).find((n) => new RegExp(`^${k}\\.(jpg|png)$`).test(n));
    if (!f) throw new Error(`${dir}/${k}.* 없음`);
    return f;
  });
  const zip = resolve(dir, "..", `${id}-refs.zip`);
  console.log(`zip: ${files.length}장 -> ${zip}`);
  if (dry) return;
  const stage = join(dir, "_zip");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage);
  for (const f of files) copyFileSync(join(dir, f), join(stage, f));
  rmSync(zip, { force: true });
  execFileSync("zip", ["-j", "-q", zip, ...files.map((f) => join(stage, f))]);
  rmSync(stage, { recursive: true, force: true });
  console.log("zip 생성 완료");
}

async function main() {
  const id = arg("character");
  if (!id || !/^[a-z]+$/.test(id)) throw new Error("--character <id> 필요");
  const dry = process.argv.includes("--dry-run");
  const dir = join(".data/photos/lora-refs", id);

  const keep = arg("keep");
  if (keep) return makeZip(id, dir, keep.split(",").map((s) => s.trim().padStart(2, "0")), dry);

  const ref = arg("ref");
  if (!ref) throw new Error("--ref <경로|URL> 필요(또는 --keep)");
  const n = Number(arg("n", "30"));
  const model = arg("model", "bfl/flux-2-pro")!;
  process.env.IMG_PROVIDER = "gateway";
  const unit = estimateImageCostUsd("gateway", model, true);
  const assumed = unit === 0;
  const per = assumed ? 0.04 : unit;
  const todo = Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, "0")).filter(
    (nn) => !existsSync(join(dir, `${nn}.jpg`)) && !existsSync(join(dir, `${nn}.png`)),
  );
  console.log(`${id}: ${n}장 중 ${todo.length}장 생성(공급자 gateway, 모델 ${model}), 호출 ${todo.length}회, 예상 비용 $${(todo.length * per).toFixed(3)}${assumed ? " (단가 미확인, $0.04/장 가정)" : ""}`);
  if (dry) {
    for (const nn of todo.slice(0, 3)) console.log(`[${nn}] ${promptOf(Number(nn) - 1)}`);
    if (todo.length > 3) console.log(`... 외 ${todo.length - 3}개`);
    return;
  }
  mkdirSync(dir, { recursive: true });
  const refUrl = refToUrl(ref);
  let failed = 0;
  let spent = 0;
  for (const nn of todo) {
    const prompt = promptOf(Number(nn) - 1);
    try {
      const out = await generateImage({ prompt, aspect: "4:5", referenceImages: [refUrl], model });
      spent += out.costUsd || per;
      writeFileSync(join(dir, `${nn}.${out.ext}`), out.bytes);
      appendFileSync(join(dir, "refs.jsonl"), JSON.stringify({ n: nn, prompt, model: out.model, created_at: new Date().toISOString() }) + "\n");
      console.log(`ok ${nn}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${nn}: ${(e as Error).message}`);
    }
  }
  console.log(`완료. 실패 ${failed}, 추정 비용 $${spent.toFixed(3)}. 검수 뒤: --character ${id} --keep 01,03,... 로 zip`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
