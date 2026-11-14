// W5c 사진 생성: plan.jsonl 행마다 LoRA 추론으로 1장씩 만들고 photos/manifest.jsonl에 행을 더한다.
// 사용: node --import tsx src/tools/generate-photos.ts --character ihan --plan content/characters/ihan/photos/plan.jsonl [--priority 1] [--model <endpoint>] [--scale 1] [--ids ihan-p001,ihan-p002] [--style candid|editorial (기본 candid, 얼굴 컷 LoRA 경로)] [--dry-run]
// 얼굴 없는 컷(LoRA 없이)은 기본 차단(결정 2026-11-14: 실사진 ingest-photos, 스톡 stock-fetch). 강제: --allow-ai-faceless
// 얼굴 없는 컷(LoRA 없이): ... --allow-ai-faceless --provider gateway --no-lora --force --ids ihan-p027,... [--model bfl/flux-2-pro(기본)]
// Gateway 참조 편집(LoRA 없이): ... --character isol --plan <plan> --provider gateway --ref .data/photos/candidates/isol/N-front.jpg --model bfl/flux-2-pro [--limit n]
// 추론 엔드포인트 기본: blackforestlabs/flux-3/klein/base/text-to-image/lora (학습 트레이너와 같은 FLUX 3 klein base. loras[].path = .data/photos/lora/<id>.json의 lora_url).
// 이어하기: .data/photos/<id>/<plan id>.jpg가 있고 manifest에 행이 있으면 건너뛴다. 이미지는 .data/photos/<id>/(gitignore).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fetchFalPricing, generateFalLora } from "../img/fal.js";
import { sizeFromAspect } from "../img/index.js";
import { generateGateway } from "../img/gateway.js";
import { activeImageProvider, GATEWAY_USD_PER_IMAGE } from "../img/index.js";
import { photoRowSchema } from "../content/schemas/photos.js";

export const FAL_LORA_INFER = "blackforestlabs/flux-3/klein/base/text-to-image/lora";
export const FAL_LORA_USD_PER_MP = 0.035; // fal 모델 목록 pricingInfoOverride (2026-11-13), 못 읽으면 이 값

export const GATEWAY_REF_USD_PER_IMAGE = 0.04; // bfl/flux-2-pro 단가 미공개 -> 가정값

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

// 이솔 참조 편집 프롬프트(복장 수위: K-팝 음악방송 심의 수준, docs/decisions.md "노출 수위")
function gatewayPrompt(r: { prompt_hint: string; face: boolean; place: string }): string {
  return `same person as the reference, same dark hair color and wavy bob, female, 23-year-old adult who looks 21-22, K-pop idol trainee. ${r.prompt_hint}. Setting: ${r.place}. no logos or text. Outfit at K-pop music-show broadcast standard: practice wear, sleeveless or cropped tops allowed; no sexualized composition, no chest or waist close-up.${r.face ? "" : " Keep the face out of frame, as described."}`;
}

// 얼굴 없는 컷: 다인 컷 단순화(사용자 검수 2026-11-14: 8명 실루엣·회식 컵 개수 오류). LoRA 쪽 HINT_OVERRIDE와 별개.
const NOFACE_HINT_OVERRIDE: Record<string, string> = {
  "ihan-p034": "two or three dancers seen from behind in matching gray practice tees facing the mirror, only backs visible",
  "ihan-p082": "two or three performer silhouettes against bright back lights, haze, no faces visible",
  "isol-p040": "two or three performer silhouettes against bright back lights, haze, no faces visible",
  "ihan-p061": "small coffee table with a few snacks and two paper cups, one cup per person, warm lamp light, no people",
  "ihan-p041": "a young man's hands raised mid-motion reflected in the mirror, torso cropped at the chest, face out of frame, plain black training top, male build",
  "ihan-p069": "close-up of a phone screen showing only heavily blurred abstract shapes with no legible text, thumb hovering above it, dim room",
  "isol-p043": "three matching pairs of colorful socks (six socks in total) laid out on the floor, top-down, soft morning light",
  "isol-p032": "low table with a few fried snacks, two drinks and two dipping sauces, warm lamp light, no people",
};
const NOFACE_CONSISTENCY = "physically consistent scene: correct object counts (one pair of shoes, one cup per person), realistic relative sizes, coherent perspective, natural clutter, no duplicated objects, candid phone photo";
const NOFACE_MULTI = /group|silhouette|dorm-table|table-(food|snacks)/;

// 얼굴 없는 컷 프롬프트(LoRA·트리거 없음)
function noFacePrompt(r: { id: string; situation: string; prompt_hint: string; place: string }): string {
  const multi = NOFACE_MULTI.test(r.situation) ? " two or three people at most, backs to camera or out of focus." : "";
  return `${NOFACE_HINT_OVERRIDE[r.id] ?? r.prompt_hint}. Setting: ${r.place}. no person, no face, no hands unless specified, still life / POV of the scene, ${NOFACE_CONSISTENCY}, no logos or text.${multi}`;
}

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
  const ids = arg("ids")?.split(",");
  const rows = (prio ? plan.filter((r) => String(r.priority) === prio) : plan).filter((r) => !ids || ids.includes(r.id));
  const customOut = arg("out-dir"); // 지정 시 매니페스트 기록·완료 판정 건너뜀(A/B 시험용)
  const outDir = customOut ?? join(".data/photos", id);
  const manifest = join("content/characters", id, "photos/manifest.jsonl");
  const done = new Set(existsSync(manifest) ? readFileSync(manifest, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
  const force = process.argv.includes("--force") || !!customOut;
  const todo = rows.filter((r) => force || !(done.has(r.id) && (existsSync(join(outDir, `${r.id}.jpg`)) || existsSync(join(outDir, `${r.id}.png`)))));

  if (process.argv.includes("--no-lora") && !process.argv.includes("--allow-ai-faceless")) {
    console.error("얼굴 없는 일상 컷은 AI 생성 안 함(결정 2026-11-14). 실사진은 ingest-photos, 스톡은 stock-fetch. 강제: --allow-ai-faceless");
    process.exit(1);
  }
  const prov = arg("provider");
  if (prov === "gateway" && process.argv.includes("--no-lora")) {
    // 얼굴이 안 나오는 컷(face=false): LoRA·트리거·참조 없이 텍스트 -> 이미지
    process.env.IMG_PROVIDER = "gateway";
    activeImageProvider(); // .env 로드
    const model3 = arg("model", "bfl/flux-2-pro")!;
    const per = GATEWAY_USD_PER_IMAGE[model3] ?? GATEWAY_REF_USD_PER_IMAGE;
    const list = todo.filter((r) => !r.face);
    console.log(`${id}: gateway 텍스트->이미지(no-lora) ${list.length}행, 모델 ${model3}, 예상 비용 $${(list.length * per).toFixed(2)}`);
    if (dry) {
      for (const r of list.slice(0, 3)) console.log(`[${r.id}] ${noFacePrompt(r)}`);
      return;
    }
    mkdirSync(outDir, { recursive: true });
    let failed3 = 0;
    for (const r of list) {
      try {
        const out = await generateGateway({ prompt: noFacePrompt(r), aspect: r.aspect ?? "4:5", model: model3 }, false);
        const path = join(outDir, `${r.id}.${out.ext}`);
        writeFileSync(path, out.bytes);
        const row = photoRowSchema.parse({ id: r.id, blob_url: path, situation: r.situation, time_of_day: r.time_of_day, place: r.place, face: r.face, audience: r.audience, source: "ai", model: model3, used: [] });
        if (!done.has(r.id)) {
          appendFileSync(manifest, JSON.stringify(row) + "\n");
          done.add(r.id);
        } else {
          // 재생성: 기존 행의 이전 검수(rejected) 표시를 지우고 source·model 갱신
          const lines = readFileSync(manifest, "utf8").split("\n").map((l) => (l && JSON.parse(l).id === r.id ? JSON.stringify(row) : l));
          writeFileSync(manifest, lines.join("\n"));
        }
        console.log(`ok ${r.id}.${out.ext}`);
      } catch (e) {
        failed3++;
        console.log(`FAIL ${r.id}: ${(e as Error).message}`);
      }
    }
    console.log(`${id} 완료. 실패 ${failed3}, 추정 비용 $${((list.length - failed3) * per).toFixed(3)}`);
    return;
  }
  if (prov === "gateway") {
    const ref = arg("ref");
    if (!ref) throw new Error("--ref <경로> 필요");
    const mime = MIME[extname(ref).toLowerCase()];
    if (!mime) throw new Error(`참조 이미지 확장자 미지원: ${ref}`);
    process.env.IMG_PROVIDER = "gateway";
    activeImageProvider(); // .env 로드
    const lim = Number(arg("limit", "0"));
    const list = lim ? todo.slice(0, lim) : todo;
    const model2 = arg("model", "bfl/flux-2-pro")!;
    console.log(`${id}: gateway 참조 편집 ${list.length}행, 모델 ${model2}, 예상 비용 $${(list.length * GATEWAY_REF_USD_PER_IMAGE).toFixed(2)} (가정 $${GATEWAY_REF_USD_PER_IMAGE}/장)`);
    if (dry) {
      for (const r of list.slice(0, 3)) console.log(`[${r.id}] ${gatewayPrompt(r)}`);
      return;
    }
    const refUrl = `data:${mime};base64,${readFileSync(ref).toString("base64")}`;
    mkdirSync(outDir, { recursive: true });
    mkdirSync(join("content/characters", id, "photos"), { recursive: true });
    let failed2 = 0;
    for (const r of list) {
      try {
        const out = await generateGateway({ prompt: gatewayPrompt(r), aspect: r.aspect ?? "4:5", referenceImages: [refUrl], model: model2 }, true);
        const path = join(outDir, `${r.id}.${out.ext}`);
        writeFileSync(path, out.bytes);
        if (!done.has(r.id)) {
          const row = photoRowSchema.parse({ id: r.id, blob_url: path, situation: r.situation, time_of_day: r.time_of_day, place: r.place, face: r.face, audience: r.audience, used: [] });
          appendFileSync(manifest, JSON.stringify(row) + "\n");
          done.add(r.id);
        }
        console.log(`ok ${r.id}`);
      } catch (e) {
        failed2++;
        console.log(`FAIL ${r.id}: ${(e as Error).message}`);
      }
    }
    console.log(`${id} 완료. 실패 ${failed2}, 가정 비용 $${((list.length - failed2) * GATEWAY_REF_USD_PER_IMAGE).toFixed(2)}`);
    return;
  }

  const price = await fetchFalPricing(model);
  const perMp = price?.usd ?? FAL_LORA_USD_PER_MP;
  const sizeOf = (r: Plan) => sizeFromAspect(r.aspect ?? "4:5");
  const est = todo.reduce((s, r) => ({ n: s.n + 1, usd: s.usd + ((sizeOf(r).width * sizeOf(r).height) / 1e6) * perMp }), { n: 0, usd: 0 });
  console.log(`${id}: plan ${rows.length}행 중 ${todo.length}행 생성(이미 완료 ${rows.length - todo.length}), 모델 ${model}, 호출 ${est.n}회, 예상 비용 $${est.usd.toFixed(3)} ($${perMp}/MP, ${price ? "fal 페이지 값" : "페이지 조회 실패, 기본값"})`);

  const lora = existsSync(join(".data/photos/lora", `${id}.json`)) ? JSON.parse(readFileSync(join(".data/photos/lora", `${id}.json`), "utf8")) : null;
  if (!lora) console.log(`주의: .data/photos/lora/${id}.json 없음(lora-train 먼저). ${dry ? "dry-run이라 계속" : ""}`);
  const trigger: string = lora?.trigger_phrase ?? `${id}x person`;
  const HINT_OVERRIDE: Record<string, string> = { "ihan-p049": "mirror selfie in the practice room, selfie holding phone toward the mirror, only one reflection, gray tee, cool dawn window light, big bright grin", "ihan-p071": "hood down, plain gray sweatshirt; sitting at the window counter of a Korean convenience store late at night, eating cup ramen with chopsticks, looking down at the food or out the window, not posing for the camera; phone propped on the table so the shot is slightly low and tilted; harsh white fluorescent ceiling light with slight green cast, window reflections, only a blurred shelf edge in the background, no readable text, wide open smile mid-bite, slightly embarrassed, hand half covering mouth", "ihan-p048": "sitting on the bench after practice, towel on shoulders, waist-up, relaxed posture, warm light, laughing out loud with teeth showing, eyes crinkled" }; // 수위 완화(2026-11-14)
  const style = arg("style", "candid");
  if (style !== "editorial" && style !== "candid") throw new Error("--style은 editorial|candid");
  const seed = arg("seed") !== undefined ? Number(arg("seed")) : undefined;
  const candidPrompt = (r: Plan) => `A natural candid smartphone photo, shot on iPhone, of ${trigger}, a 21-year-old adult Korean man (K-pop trainee), identical face and hair as trained, no identity drift. ${HINT_OVERRIDE[r.id] ?? r.prompt_hint}. Setting: ${r.place}.${/selfie/i.test(`${HINT_OVERRIDE[r.id] ?? r.prompt_hint} ${r.situation}`) ? "" : " The subject is not posing for the camera; mid-action or looking away is fine."} Youthful K-pop idol visual, youthful fresh face, clear smooth glowing skin, slim V-line face, soft styled hair (curtain bangs or soft fringe) in dark brown/black, light idol grooming (neat brows, natural lip color, no lipstick look), trendy streetwear or oversized casual idol fashion, phone-camera soft look. No logos or text. Soft natural light, no heavy retouching, not a studio shot, slightly off-center casual framing, vertical.`;
  const promptOf = (r: Plan) => style === "candid" && r.face ? candidPrompt(r) : `${trigger}, ${HINT_OVERRIDE[r.id] ?? r.prompt_hint}. Setting: ${r.place}. 21-year-old adult Korean male idol trainee, 21-year-old adult, defined jawline, mature facial structure, university-age man, no school shirt, same dark hair, no logos or text. Photorealistic photograph.`;
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
      const out = await generateFalLora({ model, prompt: promptOf(r), loraUrl: lora.lora_url, scale, size: sizeOf(r), seed, usdPerMp: perMp });
      spent += out.costUsd;
      const path = join(outDir, `${r.id}.jpg`);
      writeFileSync(path, out.bytes);
      if (!customOut && !done.has(r.id)) {
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
