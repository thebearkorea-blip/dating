import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ingestPhotos } from "../../src/tools/ingest-photos";
import { stockFetch } from "../../src/tools/stock-fetch";

const FFMPEG = "/opt/homebrew/bin/ffmpeg";

/** 2000x1000 jpg에 최소 EXIF(APP1) 세그먼트를 끼운다. */
function dummyJpg(path: string, color: string): void {
  execFileSync(FFMPEG, ["-y", "-v", "error", "-f", "lavfi", "-i", `color=c=${color}:s=2000x1000`, "-frames:v", "1", path]);
  const b = readFileSync(path);
  const tiff = Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const body = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  writeFileSync(path, Buffer.concat([b.subarray(0, 2), seg, b.subarray(2)]));
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "ingest-"));
  mkdirSync(join(root, "content/characters/c1/photos"), { recursive: true });
  mkdirSync(join(root, "own"), { recursive: true });
  return root;
}
const rows = (root: string) => readFileSync(join(root, "content/characters/c1/photos/manifest.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

it("ingest: 2장 -> manifest 2행, EXIF 제거, 1600px, 재실행 시 중복 skip", () => {
  const root = setup();
  dummyJpg(join(root, "own/convenience-store-night__01.jpg"), "red");
  dummyJpg(join(root, "own/street__02.jpg"), "blue");
  expect(readFileSync(join(root, "own/street__02.jpg")).includes("Exif")).toBe(true);
  const r = ingestPhotos({ root, character: "c1", dir: "own" });
  expect(r.added).toHaveLength(2);
  const m = rows(root);
  expect(m).toHaveLength(2);
  expect(m[0]).toMatchObject({ id: "c1-own-1", situation: "convenience-store-night", source: "own", face: false, audience: "public", time_of_day: "unknown", place: "unknown" });
  expect(m[1].situation).toBe("street");
  const out = readFileSync(join(root, ".data/photos/c1/own-1.jpg"));
  expect(out.includes("Exif")).toBe(false);
  const dim = execFileSync(FFMPEG.replace("ffmpeg", "ffprobe"), ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(root, ".data/photos/c1/own-1.jpg")], { encoding: "utf8" }).trim();
  expect(dim).toBe("1600,800");
  const again = ingestPhotos({ root, character: "c1", dir: "own" });
  expect(again.duplicates).toHaveLength(2);
  expect(rows(root)).toHaveLength(2);
});

it("ingest: dry-run은 아무것도 쓰지 않는다", () => {
  const root = setup();
  dummyJpg(join(root, "own/a__1.jpg"), "green");
  const r = ingestPhotos({ root, character: "c1", dir: "own", dryRun: true });
  expect(r.added).toHaveLength(1);
  expect(() => rows(root)).toThrow();
});

it("stock-fetch: 사람 사진 제외, 4:5에 가까운 1장 -> manifest 1행", async () => {
  const root = setup();
  const photo = (id: number, w: number, h: number, alt: string) => ({ id, width: w, height: h, url: `https://www.pexels.com/photo/${id}/`, photographer: "Kim", alt, src: { large2x: `https://images.pexels.com/${id}.jpg` } });
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(url);
    if (url.startsWith("https://api.pexels.com/")) return new Response(JSON.stringify({ photos: [photo(1, 800, 1200, "a woman in a store"), photo(2, 800, 1600, "shelf at night"), photo(3, 800, 1000, "snacks on a shelf")] }));
    return new Response(new Uint8Array([1, 2, 3]));
  }) as unknown as typeof fetch;
  const r = await stockFetch({ root, character: "c1", query: "q", situation: "convenience-store-night", n: 1, apiKey: "k", fetchFn });
  expect(r.added).toHaveLength(1);
  expect(calls[1]).toContain("/3.jpg");
  const m = rows(root);
  expect(m).toHaveLength(1);
  expect(m[0]).toMatchObject({ id: "c1-stock-3", source: "stock", license: "Pexels License", credit: "Kim / Pexels", face: false, blob_url: ".data/photos/c1/stock-3.jpg" });
  expect(readFileSync(join(root, ".data/photos/c1/stock-3.jpg"))).toHaveLength(3);
});

it("stock-fetch(pixabay): 사람 태그 제외, px 접두 파일·source_url 기록", async () => {
  const root = setup();
  const hit = (id: number, tags: string) => ({ id, largeImageURL: `https://pixabay.com/${id}_1280.jpg`, imageWidth: 800, imageHeight: 1000, user: "Lee", tags, pageURL: `https://pixabay.com/photos/x-${id}/` });
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(url);
    if (url.startsWith("https://pixabay.com/api/")) return new Response(JSON.stringify({ hits: [hit(1, "street, woman, night"), hit(2, "shelf, store, night")] }));
    return new Response(new Uint8Array([1, 2, 3]));
  }) as unknown as typeof fetch;
  const r = await stockFetch({ root, character: "c1", query: "store shelf", situation: "convenience-store-night", n: 2, apiKey: "k", provider: "pixabay", fetchFn });
  expect(r.added).toHaveLength(1);
  expect(calls[0]).toContain("key=k");
  expect(calls[1]).toContain("2_1280.jpg");
  const m = rows(root);
  expect(m).toHaveLength(1);
  expect(m[0]).toMatchObject({ id: "c1-stock-px2", source: "stock", license: "Pixabay Content License", credit: "Lee / Pixabay", source_url: "https://pixabay.com/photos/x-2/", blob_url: ".data/photos/c1/stock-px2.jpg" });
  expect(readFileSync(join(root, ".data/photos/c1/stock-px2.jpg"))).toHaveLength(3);
});
