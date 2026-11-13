// W5a 기준 얼굴 후보 생성 도구. 사용: pnpm tsx src/tools/face-candidates.ts --character ihan|isol --n 4 --shots 3 [--provider gateway|fal|mock] [--dry-run]
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

type Cand = { cand: string; face: string };
const CHARACTERS: Record<string, { subject: string; places: string[]; cands: Cand[] }> = {
  ihan: {
    subject: "a Korean man in his early twenties (21), athletic build from daily dance practice, short hair, sun-tanned skin, eyes that crease when he smiles, clearly an adult",
    places: ["dance practice room with mirrors", "dormitory room", "city street at dusk", "dance practice room with mirrors"],
    cands: [
      { cand: "A", face: "strong rounded jaw, gentle kind eyes, thick straight eyebrows" },
      { cand: "B", face: "defined jawline, slightly upturned eyes, small mole under left eye" },
      { cand: "C", face: "oval face, high cheekbones, relaxed warm look, faint stubble" },
      { cand: "D", face: "broad forehead, strong nose bridge, full lips, buzzed short hair" },
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
  const cands = ch.cands.slice(0, n);
  const shots = SHOTS.slice(0, shotCount);

  const prompts: { cand: string; shot: Shot; prompt: string; seed: number }[] = [];
  cands.forEach((c, ci) => {
    const base = `${COMMON}. ${ch.subject}. Face: ${c.face}. Setting: ${ch.places[ci]}.`;
    shots.forEach((s, si) => {
      const prompt =
        si === 0
          ? `${base} ${s.text}.`
          : `Photo of the same person as in the reference image, same face, hair, skin tone and clothes, same setting. ${s.text}.`;
      prompts.push({ cand: c.cand, shot: s, prompt, seed: 5000 + ci * 111 });
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
      const out = await generateImage({ prompt: p.prompt, aspect: "3:4", seed: p.seed, ...(front ? {} : { referenceImages: [ref!] }) });
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
