// fal 큐 REST(fetch 직접 호출, 패키지 없음). 기존 face-candidates의 호출을 옮긴 것.
import { existsSync, readFileSync } from "node:fs";
import { estimateImageCostUsd, resolveSize, sniffExt, type ImageRequest, type ImageResult } from "./index.js";

export const FAL_MODEL_T2I = "fal-ai/flux-2/klein/4b"; // FLUX.2 [klein] 4B, Apache 2.0
export const FAL_MODEL_EDIT = "fal-ai/flux-2/klein/4b/edit";
// 단가: fal 페이지 pricingInfoOverride가 4B/9B를 구분해 표시하지 않아 상한($0.011/MP)으로 추정한다.
export const FAL_USD_PER_MP = 0.011;

const PRESET: Record<string, string> = { "3:4": "portrait_4_3", "4:3": "landscape_4_3", "1:1": "square_hd", "9:16": "portrait_16_9", "16:9": "landscape_16_9" };

/** FAL_KEY를 process.env에서, 없으면 .env/.env.local에서 읽는다(값은 출력하지 않는다). */
export function falKey(): string {
  if (!process.env.FAL_KEY) for (const f of [".env", ".env.local"]) if (existsSync(f)) process.loadEnvFile(f);
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY가 .env.local에 없다");
  return key;
}

export interface QueueOpts { maxPolls?: number; intervalMs?: number }

export async function queue(key: string, model: string, body: unknown, opts: QueueOpts = {}): Promise<any> {
  const { maxPolls = 90, intervalMs = 2000 } = opts;
  const H = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const sub = await fetch(`https://queue.fal.run/${model}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!sub.ok) throw new Error(`제출 실패 ${sub.status}: ${(await sub.text()).slice(0, 300)}`);
  const { status_url, response_url } = (await sub.json()) as { status_url: string; response_url: string };
  for (let i = 0; i < maxPolls; i++) {
    const st = (await (await fetch(status_url, { headers: H })).json()) as { status: string };
    if (st.status === "COMPLETED") break;
    if (st.status !== "IN_QUEUE" && st.status !== "IN_PROGRESS") throw new Error(`상태 ${st.status}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const res = await fetch(response_url, { headers: H });
  if (!res.ok) throw new Error(`결과 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function generateFal(req: ImageRequest & { model: string }, edit: boolean): Promise<ImageResult> {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY가 .env.local에 없다");
  const dim = resolveSize(req);
  const image_size = req.aspect && !req.size && PRESET[req.aspect] ? PRESET[req.aspect] : dim;
  const body = {
    output_format: "jpeg",
    num_images: 1,
    enable_safety_checker: true,
    prompt: req.prompt,
    ...(image_size ? { image_size } : {}),
    ...(req.seed !== undefined ? { seed: req.seed } : {}),
    ...(edit ? { image_urls: req.referenceImages } : {}),
  };
  const out = await queue(key, req.model, body);
  const url: string = out.images[0].url;
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  return { bytes, url, ext: sniffExt(bytes), model: req.model, provider: "fal", costUsd: estimateImageCostUsd("fal", req.model, edit) };
}

/** fal 스토리지에 파일을 올리고 공개 URL을 돌려준다(학습용 zip 등). rest.alpha.fal.ai 2단계 업로드. */
export async function uploadFal(key: string, bytes: Buffer, fileName: string, contentType: string): Promise<string> {
  const H = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const init = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST",
    headers: H,
    body: JSON.stringify({ content_type: contentType, file_name: fileName }),
  });
  if (!init.ok) throw new Error(`업로드 시작 실패 ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const { upload_url, file_url } = (await init.json()) as { upload_url: string; file_url: string };
  const put = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": contentType }, body: new Uint8Array(bytes) });
  if (!put.ok) throw new Error(`업로드 실패 ${put.status}`);
  return file_url;
}

/** 엔드포인트 단가 문구(fal 모델 목록 pricingInfoOverride)에서 첫 "$x ... per"의 x를 읽는다. 못 읽으면 null. 조회는 무료. */
export async function fetchFalPricing(endpointId: string): Promise<{ usd: number; text: string } | null> {
  try {
    const res = await fetch(`https://fal.ai/api/models?keywords=${encodeURIComponent(endpointId)}`);
    if (!res.ok) return null;
    const items = ((await res.json()) as { items: { id: string; pricingInfoOverride?: string }[] }).items;
    const text = items.find((i) => i.id === endpointId)?.pricingInfoOverride;
    const m = text?.match(/\$([0-9.]+)\*{0,2}\s*per/);
    return m && text ? { usd: Number(m[1]), text } : null;
  } catch {
    return null;
  }
}

/** LoRA 추론(text-to-image + loras[]). 단가는 메가픽셀당 usdPerMp. */
export async function generateFalLora(req: {
  model: string;
  prompt: string;
  loraUrl: string;
  scale?: number;
  size: { width: number; height: number };
  seed?: number;
  usdPerMp: number;
}): Promise<ImageResult> {
  const key = falKey();
  const body = {
    prompt: req.prompt,
    loras: [{ path: req.loraUrl, scale: req.scale ?? 1 }],
    image_size: req.size,
    num_images: 1,
    output_format: "jpeg",
    enable_safety_checker: true,
    ...(req.seed !== undefined ? { seed: req.seed } : {}),
  };
  const out = await queue(key, req.model, body);
  const url: string = out.images[0].url;
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  return { bytes, url, ext: sniffExt(bytes), model: req.model, provider: "fal", costUsd: ((req.size.width * req.size.height) / 1e6) * req.usdPerMp };
}
