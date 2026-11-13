// W5a 기준 얼굴 후보 생성 도구. 사용: pnpm tsx src/tools/face-candidates.ts --character ihan|isol --n 4 --shots 3 [--dry-run]
// fal 큐 REST를 fetch로 직접 호출한다(패키지 설치 없음). 정면은 text-to-image, 나머지 컷은 정면을 참조로 한 edit.
// 이미지는 .data/photos/candidates/(gitignore), 저장소에는 매니페스트만 남긴다.
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const T2I = "fal-ai/flux-2/klein/4b"; // FLUX.2 [klein] 4B, Apache 2.0
const EDIT = "fal-ai/flux-2/klein/4b/edit";
// 단가: fal 페이지 pricingInfoOverride가 4B/9B를 구분해 표시하지 않아 상한($0.011/MP)으로 추정한다.
const USD_PER_MP = 0.011;
const MP_T2I = 1.0; // 정면: 출력 1MP
const MP_EDIT = 2.0; // edit: 입력 1MP + 출력 1MP

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
  "candid photorealistic photograph, natural light, 35mm, shallow depth of field, a Korean adult clearly in his or her 20s, mature adult face, no makeup retouching, everyday clothes";

type Cand = { cand: string; face: string };
const CHARACTERS: Record<string, { subject: string; places: string[]; cands: Cand[] }> = {
  ihan: {
    subject: "Korean man, about 24 years old, athletic dancer's build, sun-tanned skin, short black hair, eyes crinkle into crescents when he smiles",
    places: ["dance practice room with mirrors", "dormitory room", "city street at dusk", "dance practice room with mirrors"],
    cands: [
      { cand: "A", face: "soft rounded jaw, gentle kind eyes, thick straight eyebrows" },
      { cand: "B", face: "defined jawline, slightly upturned eyes, small mole under left eye" },
      { cand: "C", face: "oval face, high cheekbones, relaxed warm look, faint stubble" },
      { cand: "D", face: "broad forehead, strong nose bridge, full lips, buzzed short hair" },
    ],
  },
  isol: {
    subject: "Korean woman, about 25 years old, working-adult everyday look, expressive face, natural unstyled shoulder-length dark hair",
    places: ["dance practice room with mirrors", "dormitory room", "city street at dusk", "dormitory room"],
    cands: [
      { cand: "A", face: "oval face, large expressive eyes, straight eyebrows, light freckles" },
      { cand: "B", face: "sharp chin, single eyelids, wide mouth, confident look" },
      { cand: "C", face: "round cheeks, double eyelids, small nose, playful look" },
      { cand: "D", face: "long face, defined cheekbones, thick eyebrows, tired-but-bright look" },
    ],
  },
};

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

function loadKey(): string {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const k = process.env.FAL_KEY;
  if (!k) throw new Error("FAL_KEY가 .env.local에 없다");
  return k;
}

async function fal(key: string, model: string, body: unknown): Promise<any> {
  const H = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const sub = await fetch(`https://queue.fal.run/${model}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!sub.ok) throw new Error(`제출 실패 ${sub.status}: ${(await sub.text()).slice(0, 300)}`);
  const { status_url, response_url } = (await sub.json()) as { status_url: string; response_url: string };
  for (let i = 0; i < 90; i++) {
    const st = (await (await fetch(status_url, { headers: H })).json()) as { status: string };
    if (st.status === "COMPLETED") break;
    if (st.status !== "IN_QUEUE" && st.status !== "IN_PROGRESS") throw new Error(`상태 ${st.status}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const res = await fetch(response_url, { headers: H });
  if (!res.ok) throw new Error(`결과 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function main() {
  const id = arg("character");
  const n = Number(arg("n", "4"));
  const shotCount = Number(arg("shots", "3"));
  const dry = process.argv.includes("--dry-run");
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

  const fronts = prompts.filter((p) => p.shot.name === "front").length;
  const edits = prompts.length - fronts;
  const est = (fronts * MP_T2I + edits * MP_EDIT) * USD_PER_MP;
  console.log(`${id}: ${prompts.length}장(t2i ${fronts} + edit ${edits}), 예상 비용 상한 $${est.toFixed(3)} (단가 $${USD_PER_MP}/MP)`);
  if (dry) {
    for (const p of prompts) console.log(`[${p.cand}-${p.shot.name}] seed=${p.seed} ${p.prompt}`);
    return;
  }

  const key = loadKey();
  const dir = join(".data/photos/candidates", id);
  const manDir = join("content/characters", id, "photos");
  mkdirSync(dir, { recursive: true });
  mkdirSync(manDir, { recursive: true });
  const manifest = join(manDir, "candidates.jsonl");
  const done = new Set<string>(
    existsSync(manifest)
      ? readFileSync(manifest, "utf8").split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.cand}-${r.shot}`; })
      : [],
  );
  const frontUrl: Record<string, string> = {};
  let spent = 0;
  let failed = 0;
  for (const p of prompts) {
    const tag = `${p.cand}-${p.shot.name}`;
    if (done.has(tag)) { console.log(`skip ${tag}`); continue; }
    try {
      const common = { output_format: "jpeg", num_images: 1, seed: p.seed, enable_safety_checker: true, image_size: "portrait_4_3" };
      let out: any;
      if (p.shot.name === "front") {
        out = await fal(key, T2I, { ...common, prompt: p.prompt });
        spent += MP_T2I * USD_PER_MP;
      } else {
        const ref = frontUrl[p.cand];
        if (!ref) throw new Error("정면 참조 없음");
        out = await fal(key, EDIT, { ...common, prompt: p.prompt, image_urls: [ref] });
        spent += MP_EDIT * USD_PER_MP;
      }
      const url: string = out.images[0].url;
      if (p.shot.name === "front") frontUrl[p.cand] = url;
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      const path = join(dir, `${tag}.jpg`);
      writeFileSync(path, buf);
      appendFileSync(
        manifest,
        JSON.stringify({ cand: p.cand, shot: p.shot.name, path: `/Users/gim-yeonho/v/date/${path}`, prompt: p.prompt, model: p.shot.name === "front" ? T2I : EDIT, seed: out.seed ?? p.seed, created_at: new Date().toISOString() }) + "\n",
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
