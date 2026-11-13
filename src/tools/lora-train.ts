// W5b~c LoRA 학습: 참조 zip을 fal 스토리지에 올리고 트레이너 큐 제출 -> 완료 대기 -> LoRA URL 저장.
// 사용: node --import tsx src/tools/lora-train.ts --character ihan --zip <경로> [--steps 1000] [--trigger "ihanx person"] [--trainer <endpoint>] [--dry-run]
// 트레이너: fal에 FLUX.2 klein 4B 트레이너는 없다(9B만, 비상업). 기본은 blackforestlabs/flux-3/klein/base/trainer
// (스키마: images_data_url[필수], steps 100~10000=1000, learning_rate=1e-4, resolution 512|768|1024, trigger_phrase, enable_safety_checker).
// 결과 .data/photos/lora/<id>.json(저장소 밖). 출력 lora_file.url.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fetchFalPricing, falKey, queue, uploadFal } from "../img/fal.js";

export const FAL_TRAINER = "blackforestlabs/flux-3/klein/base/trainer";
export const FAL_TRAINER_USD_PER_STEP = 0.0043; // fal 모델 목록 pricingInfoOverride (2026-11-13), 못 읽으면 이 값

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const id = arg("character");
  const zip = arg("zip");
  if (!id || !/^[a-z]+$/.test(id)) throw new Error("--character <id> 필요");
  if (!zip) throw new Error("--zip <경로> 필요");
  const steps = Number(arg("steps", "1000"));
  const trigger = arg("trigger", `${id}x person`)!;
  const trainer = arg("trainer", FAL_TRAINER)!;
  const dry = process.argv.includes("--dry-run");

  const bytes = readFileSync(zip);
  const price = await fetchFalPricing(trainer);
  const perStep = price?.usd ?? FAL_TRAINER_USD_PER_STEP;
  console.log(`${id}: 트레이너 ${trainer}, zip ${basename(zip)} ${(bytes.length / 1e6).toFixed(1)}MB, steps ${steps}, trigger "${trigger}"`);
  console.log(`호출 2회(업로드 + 학습), 예상 비용 $${(steps * perStep).toFixed(2)} ($${perStep}/step, ${price ? "fal 페이지 값" : "페이지 조회 실패, 기본값"})`);
  if (dry) return;

  const key = falKey();
  const zipUrl = await uploadFal(key, bytes, basename(zip), "application/zip");
  console.log("업로드 완료, 학습 제출");
  const out = await queue(key, trainer, { images_data_url: zipUrl, steps, trigger_phrase: trigger }, { maxPolls: 720, intervalMs: 5000 });
  const loraUrl: string | undefined = out.lora_file?.url ?? out.diffusers_lora_file?.url;
  if (!loraUrl) throw new Error("응답에 lora_file URL 없음");
  mkdirSync(".data/photos/lora", { recursive: true });
  const path = join(".data/photos/lora", `${id}.json`);
  writeFileSync(path, JSON.stringify({ character: id, trainer, lora_url: loraUrl, config_url: out.config_file?.url, trigger_phrase: trigger, steps, est_cost_usd: steps * perStep, created_at: new Date().toISOString() }, null, 2) + "\n");
  console.log(`완료 -> ${path}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
