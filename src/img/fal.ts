// fal 큐 REST(fetch 직접 호출, 패키지 없음). 기존 face-candidates의 호출을 옮긴 것.
import { estimateImageCostUsd, resolveSize, sniffExt, type ImageRequest, type ImageResult } from "./index.js";

export const FAL_MODEL_T2I = "fal-ai/flux-2/klein/4b"; // FLUX.2 [klein] 4B, Apache 2.0
export const FAL_MODEL_EDIT = "fal-ai/flux-2/klein/4b/edit";
// 단가: fal 페이지 pricingInfoOverride가 4B/9B를 구분해 표시하지 않아 상한($0.011/MP)으로 추정한다.
export const FAL_USD_PER_MP = 0.011;

const PRESET: Record<string, string> = { "3:4": "portrait_4_3", "4:3": "landscape_4_3", "1:1": "square_hd", "9:16": "portrait_16_9", "16:9": "landscape_16_9" };

async function queue(key: string, model: string, body: unknown): Promise<any> {
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
