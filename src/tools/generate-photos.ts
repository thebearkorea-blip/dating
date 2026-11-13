// W5c 사진 생성: plan.jsonl 행마다 LoRA 추론으로 1장씩 만들고 photos/manifest.jsonl에 행을 더한다.
// 사용: node --import tsx src/tools/generate-photos.ts --character ihan --plan content/characters/ihan/photos/plan.jsonl [--priority 1] [--model <endpoint>] [--scale 1] [--dry-run]
// 추론 엔드포인트 기본: blackforestlabs/flux-3/klein/base/text-to-image/lora (학습 트레이너와 같은 FLUX 3 klein base. loras[].path = .data/photos/lora/<id>.json의 lora_url).
// 이어하기: .data/photos/<id>/<plan id>.jpg가 있고 manifest에 행이 있으면 건너뛴다. 이미지는 .data/photos/<id>/(gitignore).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchFalPricing, generateFalLora } from "../img/fal.js";
import { sizeFromAspect } from "../img/index.js";
import { photoRowSchema } from "../content/schemas/photos.js";

export const FAL_LORA_INFER = "blackforestlabs/flux-3/klein/base/text-to-image/lora";
export const FAL_LORA_USD_PER_MP = 0.035; // fal 모델 목록 pricingInfoOverride (2026-11-13), 못 읽으면 이 값

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

type Plan = { id: string; situation: string; time_of_day: string; place: string; face: boolean; audience: "public" | "private"; prompt_hint: string; aspect?: string; priority?: number };

async function main() {
  const id = arg("character");
  const planPath = arg("plan");
  if (!id || !/^[a-z]+$/.test(id)) throw new Error("--character <id> 필요");
  if (!planPath) throw new Error("--plan <경로> 필요");
  const dry = process.argv.includes("--dry-run");
  const prio = arg("priority");
  const model = arg("model", FAL_LORA_INFER)!;
  const scale = Number(arg("scale", "1"));

  const plan: Plan[] = readFileSync(planPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.id);
  const rows = prio ? plan.filter((r) => String(r.priority) === prio) : plan;
  const outDir = join(".data/photos", id);
  const manifest = join("content/characters", id, "photos/manifest.jsonl");
  const done = new Set(existsSync(manifest) ? readFileSync(manifest, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
  const todo = rows.filter((r) => !(done.has(r.id) && existsSync(join(outDir, `${r.id}.jpg`))));

  const price = await fetchFalPricing(model);
  const perMp = price?.usd ?? FAL_LORA_USD_PER_MP;
  const sizeOf = (r: Plan) => sizeFromAspect(r.aspect ?? "4:5");
  const est = todo.reduce((s, r) => ({ n: s.n + 1, usd: s.usd + ((sizeOf(r).width * sizeOf(r).height) / 1e6) * perMp }), { n: 0, usd: 0 });
  console.log(`${id}: plan ${rows.length}행 중 ${todo.length}행 생성(이미 완료 ${rows.length - todo.length}), 모델 ${model}, 호출 ${est.n}회, 예상 비용 $${est.usd.toFixed(3)} ($${perMp}/MP, ${price ? "fal 페이지 값" : "페이지 조회 실패, 기본값"})`);

  const lora = existsSync(join(".data/photos/lora", `${id}.json`)) ? JSON.parse(readFileSync(join(".data/photos/lora", `${id}.json`), "utf8")) : null;
  if (!lora) console.log(`주의: .data/photos/lora/${id}.json 없음(lora-train 먼저). ${dry ? "dry-run이라 계속" : ""}`);
  const trigger: string = lora?.trigger_phrase ?? `${id}x person`;
  const promptOf = (r: Plan) => `${trigger}, ${r.prompt_hint}. Setting: ${r.place}. Photorealistic photograph.`;
  if (dry) {
    for (const r of todo.slice(0, 3)) console.log(`[${r.id}] ${promptOf(r)}`);
    if (todo.length > 3) console.log(`... 외 ${todo.length - 3}행`);
    return;
  }
  if (!lora) throw new Error(`.data/photos/lora/${id}.json 없음`);

  mkdirSync(outDir, { recursive: true });
  mkdirSync(join("content/characters", id, "photos"), { recursive: true });
  let failed = 0;
  let spent = 0;
  for (const r of todo) {
    try {
      const out = await generateFalLora({ model, prompt: promptOf(r), loraUrl: lora.lora_url, scale, size: sizeOf(r), usdPerMp: perMp });
      spent += out.costUsd;
      const path = join(outDir, `${r.id}.jpg`);
      writeFileSync(path, out.bytes);
      if (!done.has(r.id)) {
        const row = photoRowSchema.parse({ id: r.id, blob_url: path, situation: r.situation, time_of_day: r.time_of_day, place: r.place, face: r.face, audience: r.audience, used: [] });
        appendFileSync(manifest, JSON.stringify(row) + "\n");
      }
      console.log(`ok ${r.id}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${r.id}: ${(e as Error).message}`);
    }
  }
  console.log(`${id} 완료. 실패 ${failed}, 추정 비용 $${spent.toFixed(3)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
