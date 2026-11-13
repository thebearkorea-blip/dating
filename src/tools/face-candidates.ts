// W5a 기준 얼굴 후보 생성 도구. 사용: pnpm tsx src/tools/face-candidates.ts --character ihan|isol --n 4 [--cands E,F,G,H] --shots 3 [--provider gateway|fal|mock] [--dry-run]
// 공급자는 src/img가 고른다(IMG_PROVIDER > Gateway 토큰 > FAL_KEY > mock). 정면은 text-to-image, 나머지 컷은 정면을 참조로 한 edit.
// 이미지는 .data/photos/candidates/(gitignore), 저장소에는 매니페스트만 남긴다.
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { activeImageProvider, defaultModel, estimateImageCostUsd, generateImage, toDataUrl } from "../img/index.js";

type Shot = { name: string; text: string };
const SHOTS: Shot[] = [
  { name: "front", text: "facing the camera straight on, neutral calm expression, head and shoulders" },
  {
    name: "angle45",
    text: "head turned about 45 degrees to the side, looking slightly past the camera, calm expression, head and shoulders",
  },
  { name: "smile", text: "facing the camera, laughing naturally with a wide genuine smile, head and shoulders" },
];

const COMMON =
  "candid photorealistic photograph, natural light, 35mm, shallow depth of field, everyday clothes";

// 2차(E~H): 성인이 분명한 20대 초중반 K-팝 연습생 비주얼. 1차(A~D)는 COMMON/subject를 그대로 쓴다.
const COMMON2 =
  "photorealistic editorial-quality but candid portrait, K-pop trainee visual, photogenic, soft natural window light with a subtle warm rim light, clear healthy skin with natural texture, styled hair, camera-aware confident expression, 85mm, shallow depth of field, clean stylish casual outfit";

const S2_IHAN = "a Korean man in his early-to-mid twenties, clearly an adult, slim and toned dancer's physique, mature defined facial structure, no baby fat";
const S2_ISOL = "a Korean woman in her mid twenties, clearly an adult, slim toned physique, mature defined facial structure, no baby fat, polished and sophisticated rather than cute";

// 모델 비교(--model, 정면 1컷): 후보 문구 대신 아이돌 화보 문구를 통째로 쓴다. {place}는 캐릭터별 장소.
const IDOL_PROMPT: Record<string, { text: string; place: string }> = {
  ihan: {
    text: "professional K-pop idol photoshoot portrait, beauty lighting with soft key and rim light, 85mm. A 21-year-old adult Korean male idol trainee: small face, smooth even glass skin, bright clear double-lidded eyes, soft defined jawline, high nose bridge, light natural idol makeup, stylish two-block haircut with soft fringe, slim frame, fashionable black-and-white casual outfit, gentle confident smile. Setting: {place}.",
    place: "dance practice room with soft window light",
  },
  isol: {
    text: "professional K-pop female idol group photoshoot portrait, beauty lighting, 85mm. A 23-year-old adult Korean female idol trainee: small face, dewy luminous skin, bright double-lidded eyes, refined nose, natural idol makeup with soft coral lip, glossy long layered dark hair, slim frame, chic casual outfit, playful knowing smile. Setting: {place}.",
    place: "quiet cafe with soft daylight",
  },
};

// 3차(I~L, 정면만): IDOL_PROMPT 계열 + 변주(눈매·턱선·머리·분위기). 성인 단서를 유지한다.
const IDOL3: Record<string, string> = {
  ihan: "professional K-pop idol photoshoot portrait, beauty lighting with soft key and rim light, 85mm. A 21-year-old adult Korean male idol, a university-aged adult who clearly looks over twenty, mature adult shoulder line and neck line, small face, smooth even glass skin, light natural idol makeup, slim frame, fashionable black-and-white casual outfit.",
  isol: "professional K-pop female idol group photoshoot portrait, beauty lighting, 85mm. A 23-year-old adult Korean female idol, clearly an adult woman, mature adult shoulder line and neck line, small face, dewy luminous skin, natural idol makeup, slim frame, chic casual outfit.",
};

type Cand = { cand: string; face: string; v2?: boolean; v3?: boolean; subject?: string; place?: string };
const CHARACTERS: Record<string, { subject: string; places: string[]; cands: Cand[] }> = {
  ihan: {
    subject: "a Korean man in his early twenties (21), athletic build from daily dance practice, short hair, sun-tanned skin, eyes that crease when he smiles, clearly an adult",
    places: ["dance practice room with mirrors", "dormitory room", "city street at dusk", "dance practice room with mirrors"],
    cands: [
      { cand: "A", face: "strong rounded jaw, gentle kind eyes, thick straight eyebrows" },
      { cand: "B", face: "defined jawline, slightly upturned eyes, small mole under left eye" },
      { cand: "C", face: "oval face, high cheekbones, relaxed warm look, faint stubble" },
      { cand: "D", face: "broad forehead, strong nose bridge, full lips, buzzed short hair" },
      { cand: "E", v2: true, subject: S2_IHAN, place: "dance practice room with soft window light", face: "sharp jawline, double eyelids, straight thick brows, warm smile lines, idol-trainee look" },
      { cand: "F", v2: true, subject: S2_IHAN, place: "bright dormitory room by a window", face: "soft V-line jaw, monolid eyes with long lashes, pale clear skin, two-block haircut" },
      { cand: "G", v2: true, subject: S2_IHAN, place: "city rooftop at golden hour", face: "high nose bridge, deep-set eyes, athletic shoulders, sun-kissed skin, bright grin" },
      { cand: "H", v2: true, subject: S2_IHAN, place: "quiet cafe with soft daylight", face: "oval face, dimples, slightly wavy dark hair, calm gaze" },
      { cand: "I", v3: true, place: "dance practice room with soft window light", face: "double-lidded eyes, soft defined jawline, two-block haircut with soft fringe, fresh and clear mood" },
      { cand: "J", v3: true, place: "city rooftop at golden hour", face: "subtle inner-double eyelids (hidden double lid), sharp V-line jaw, neat dandy cut, chic cool mood" },
      { cand: "K", v3: true, place: "quiet cafe with soft daylight", face: "double-lidded eyes with a gentle curve, rounded soft jaw, center-parted soft perm, warm kind mood" },
      { cand: "L", v3: true, place: "city street at dusk with warm shop lights", face: "inner-double eyelids, defined square-ish jawline, two-block haircut swept up, playful mischievous mood" },
    ],
  },
  isol: {
    subject: "a Korean woman, 23 years old, mature adult with the composure of a working professional, clearly an adult",
    places: ["dance practice room with mirrors", "dormitory room", "city street at dusk", "dormitory room"],
    cands: [
      { cand: "A", face: "oval face, large expressive eyes, straight eyebrows, light freckles" },
      { cand: "B", face: "sharp chin, single eyelids, wide mouth, confident look" },
      { cand: "C", face: "defined cheekbones, double eyelids, straight nose, quick knowing smile" },
      { cand: "D", face: "long face, defined cheekbones, thick eyebrows, tired-but-bright look" },
      { cand: "E", v2: true, subject: S2_ISOL, place: "dance practice room with soft window light", face: "sharp defined features, double eyelids, straight refined nose, sleek straight dark hair, polished natural makeup, cool confident gaze" },
      { cand: "F", v2: true, subject: S2_ISOL, place: "bright dormitory room by a window", face: "slim V-line jaw, subtle monolid eyes with long lashes, luminous clear skin, soft natural makeup, hair in a sleek low ponytail" },
      { cand: "G", v2: true, subject: S2_ISOL, place: "city street at golden hour", face: "high cheekbones, well-defined eyebrows, deep-set eyes, glossy shoulder-length layered hair, natural makeup, knowing playful smile" },
      { cand: "H", v2: true, subject: S2_ISOL, place: "quiet cafe with soft daylight", face: "balanced oval face, elegant arched brows, defined lips, wavy dark hair with curtain bangs, natural makeup, composed gaze" },
      { cand: "I", v3: true, place: "dance practice room with soft window light", face: "double-lidded eyes, slim V-line jaw, glossy long straight dark hair, fresh and clear mood" },
      { cand: "J", v3: true, place: "city rooftop at golden hour", face: "subtle inner-double eyelids (hidden double lid), sharp defined chin, sleek C-curl bob, chic cool mood" },
      { cand: "K", v3: true, place: "quiet cafe with soft daylight", face: "double-lidded eyes with a soft curve, gently rounded jaw, long hair with soft C-curl ends, warm kind mood" },
      { cand: "L", v3: true, place: "city street at dusk with warm shop lights", face: "inner-double eyelids, defined cheekbones, short chin-length bob with bangs, playful mischievous mood" },
    ],
  },
};

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const id = arg("character");
  const n = Number(arg("n", "4"));
  const shotCount = Number(arg("shots", "3"));
  const dry = process.argv.includes("--dry-run");
  const prov = arg("provider");
  if (prov) {
    if (prov !== "gateway" && prov !== "fal" && prov !== "mock") throw new Error("--provider gateway|fal|mock");
    process.env.IMG_PROVIDER = prov;
  }
  const ch = id ? CHARACTERS[id] : undefined;
  if (!id || !ch) throw new Error("--character ihan|isol 필요");
  const pick = arg("cands");
  const model = arg("model");
  const label = arg("label", "M");
  const cands: Cand[] = model && !pick ? [{ cand: label!, face: "" }] : pick ? ch.cands.filter((c) => pick.split(",").includes(c.cand)) : ch.cands.slice(0, n);
  if (!cands.length) throw new Error("--cands에 해당하는 후보 없음");
  const shots = SHOTS.slice(0, shotCount);

  const prompts: { cand: string; shot: Shot; prompt: string; seed: number }[] = [];
  cands.forEach((c, ci) => {
    const idol = IDOL_PROMPT[id]!;
    const base = c.v3
      ? `${IDOL3[id]} Face: ${c.face}. Setting: ${c.place}.`
      : model
      ? idol.text.replace("{place}", idol.place)
      : c.v2
      ? `${COMMON2}. ${c.subject}. Face: ${c.face}. Setting: ${c.place}.`
      : `${COMMON}. ${ch.subject}. Face: ${c.face}. Setting: ${ch.places[ci]}.`;
    shots.forEach((s, si) => {
      const prompt =
        si === 0
          ? `${base} ${s.text}.`
          : `Photo of the same person as in the reference image, same face, hair, skin tone and clothes, same setting. ${s.text}.`;
      prompts.push({ cand: c.cand, shot: s, prompt, seed: model ? 7000 : 5000 + ch.cands.indexOf(c) * 111 });
    });
  });

  const provider = activeImageProvider();
  const mT2I = defaultModel(provider, false);
  const mEdit = defaultModel(provider, true);
  const fronts = prompts.filter((p) => p.shot.name === "front").length;
  const edits = prompts.length - fronts;
  const est = fronts * estimateImageCostUsd(provider, mT2I) + edits * estimateImageCostUsd(provider, mEdit, true);
  console.log(`${id}: ${prompts.length}장(t2i ${fronts} + edit ${edits}), 공급자 ${provider}, 모델 t2i=${mT2I} edit=${mEdit}, 예상 비용 $${est.toFixed(3)}`);
  if (dry) {
    for (const p of prompts) console.log(`[${p.cand}-${p.shot.name}] seed=${p.seed} ${p.prompt}`);
    return;
  }

  const dir = join(".data/photos/candidates", id);
  const manDir = join("content/characters", id, "photos");
  mkdirSync(dir, { recursive: true });
  // mock 산출물이 content 매니페스트와 이어하기(skip) 기록을 오염시키지 않게 .data에 따로 둔다.
  const manifest = provider === "mock" ? join(dir, "candidates.mock.jsonl") : join(manDir, "candidates.jsonl");
  if (provider !== "mock") mkdirSync(manDir, { recursive: true });
  const done = new Set<string>(
    existsSync(manifest)
      ? readFileSync(manifest, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.cand}-${r.shot}`; })
      : [],
  );
  const frontRef: Record<string, string> = {};
  let spent = 0;
  let failed = 0;
  for (const p of prompts) {
    const tag = `${p.cand}-${p.shot.name}`;
    if (done.has(tag)) { console.log(`skip ${tag}`); continue; }
    try {
      const front = p.shot.name === "front";
      const ref = frontRef[p.cand];
      if (!front && !ref) throw new Error("정면 참조 없음");
      const out = await generateImage({ prompt: p.prompt, ...(model ? { model } : {}), ...(model?.includes("seedream") ? { size: "1664x2216" } : { aspect: "3:4" }), seed: p.seed, ...(front ? {} : { referenceImages: [ref!] }) });
      spent += out.costUsd;
      if (front) frontRef[p.cand] = toDataUrl(out);
      const path = join(dir, `${tag}.${out.ext}`);
      writeFileSync(path, out.bytes);
      appendFileSync(
        manifest,
        JSON.stringify({ cand: p.cand, shot: p.shot.name, path: `/Users/gim-yeonho/v/date/${path}`, prompt: p.prompt, model: out.model, seed: p.seed, created_at: new Date().toISOString() }) + "\n",
      );
      console.log(`ok ${tag}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${tag}: ${(e as Error).message}`);
    }
  }
  console.log(`${id} 완료. 실패 ${failed}, 추정 비용 $${spent.toFixed(3)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
