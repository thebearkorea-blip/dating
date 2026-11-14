// 무료 상업 스톡(Pexels) 수집: 검색 -> 세로/4:5에 가까운 순 -> src.large2x 저장 -> manifest 행(source:"stock").
// 사용: node --import tsx src/tools/stock-fetch.ts --character ihan --query "convenience store shelf night korea" --situation convenience-store-night --n 3 [--dry-run]
// 키: PEXELS_API_KEY(.env.local). 없으면 안내 후 종료. 사람이 있는 사진(alt에 person/people/man/woman 등)은 제외한다.
// 이미지는 .data/photos/<c>/stock-<pexels id>.jpg(gitignore). time_of_day·place는 plan.jsonl의 같은 situation 행에서 가져오고 없으면 "unknown".
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { photoRowSchema } from "../content/schemas/photos.js";

type PexelsPhoto = { id: number; width: number; height: number; url: string; photographer: string; alt?: string; src: { large2x: string } };
export type StockOpts = {
  root: string;
  character: string;
  query: string;
  situation: string;
  n: number;
  apiKey: string;
  dryRun?: boolean;
  fetchFn?: typeof fetch;
};
export type StockResult = { added: string[]; skipped: string[] };

const PERSON = /\b(person|people|man|men|woman|women|girl|boy|child|children|couple|portrait|face|model)\b/i;
const TARGET_RATIO = 4 / 5;

export async function stockFetch(o: StockOpts): Promise<StockResult> {
  const f = o.fetchFn ?? fetch;
  const outDir = join(o.root, ".data/photos", o.character);
  const manifest = join(o.root, "content/characters", o.character, "photos/manifest.jsonl");
  const planPath = join(o.root, "content/characters", o.character, "photos/plan.jsonl");
  const done = new Set(existsSync(manifest) ? readFileSync(manifest, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
  const planRow = existsSync(planPath)
    ? readFileSync(planPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.situation === o.situation)
    : undefined;

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(o.query)}&per_page=40&orientation=portrait`;
  const r = await f(url, { headers: { Authorization: o.apiKey } });
  if (!r.ok) throw new Error(`Pexels 검색 실패 ${r.status}`);
  const photos: PexelsPhoto[] = ((await r.json()) as { photos?: PexelsPhoto[] }).photos ?? [];
  const res: StockResult = { added: [], skipped: [] };
  const ranked = photos
    .filter((p) => {
      if (PERSON.test(p.alt ?? "")) {
        res.skipped.push(`${p.id} (사람: ${p.alt})`);
        return false;
      }
      if (done.has(`${o.character}-stock-${p.id}`)) {
        res.skipped.push(`${p.id} (이미 있음)`);
        return false;
      }
      return true;
    })
    .sort((a, b) => Math.abs(a.width / a.height - TARGET_RATIO) - Math.abs(b.width / b.height - TARGET_RATIO));

  for (const p of ranked.slice(0, o.n)) {
    const id = `${o.character}-stock-${p.id}`;
    const path = `.data/photos/${o.character}/stock-${p.id}.jpg`;
    if (!o.dryRun) {
      const img = await f(p.src.large2x);
      if (!img.ok) {
        res.skipped.push(`${p.id} (다운로드 ${img.status})`);
        continue;
      }
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(o.root, path), Buffer.from(await img.arrayBuffer()));
      const row = photoRowSchema.parse({
        id,
        blob_url: path,
        situation: o.situation,
        time_of_day: planRow?.time_of_day ?? "unknown",
        place: planRow?.place ?? "unknown",
        face: false,
        audience: "public",
        source: "stock",
        license: "Pexels License",
        credit: `${p.photographer} / Pexels`,
        used: [],
      });
      mkdirSync(join(manifest, ".."), { recursive: true });
      appendFileSync(manifest, JSON.stringify(row) + "\n");
    }
    res.added.push(`${p.id} -> ${path} (${p.photographer}, ${p.width}x${p.height}, alt: ${p.alt ?? ""}) ${p.url}`);
  }
  return res;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  for (const f of [".env", ".env.local"]) if (existsSync(f)) process.loadEnvFile(f);
  const character = arg("character");
  const query = arg("query");
  const situation = arg("situation");
  if (!character || !/^[a-z]+$/.test(character)) throw new Error("--character <id> 필요");
  if (!query || !situation) throw new Error("--query, --situation 필요");
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.log("PEXELS_API_KEY 필요: https://www.pexels.com/api/ 에서 무료 발급 후 .env.local에 PEXELS_API_KEY=... 추가");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const r = await stockFetch({ root: process.cwd(), character, query, situation, n: Number(arg("n") ?? "3"), apiKey, dryRun });
  for (const a of r.added) console.log(`${dryRun ? "[dry-run] " : ""}추가 ${a}`);
  for (const s of r.skipped) console.log(`제외 ${s}`);
  console.log(`${character}: 추가 ${r.added.length}, 제외 ${r.skipped.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
