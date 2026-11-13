// Vercel AI Gateway 이미지 REST(직접 fetch). 형식 출처:
// vercel.com/docs/ai-gateway/modalities/image-generation/openai
//  - 생성: POST /v1/images/generations {model, prompt, n, response_format:"b64_json", size?} -> {data:[{b64_json}]}
//  - 편집(참조): POST /v1/images/edits JSON {model, prompt, images:[{image_url: https URL | data URL}]} -> {data:[{b64_json}]}
// 인증: Authorization: Bearer <AI_GATEWAY_API_KEY | VERCEL_OIDC_TOKEN>.
// size·seed 필드는 docs에 모델별 지원이 명시돼 있지 않다(미확인) — 보내되 거부되면 오류로 드러난다.
import { estimateImageCostUsd, gatewayToken, resolveSize, sniffExt, type ImageRequest, type ImageResult } from "./index.js";

const BASE = "https://ai-gateway.vercel.sh/v1";
const TIMEOUT_MS = 60_000;

export async function generateGateway(req: ImageRequest & { model: string; extra?: Record<string, unknown> }, edit: boolean): Promise<ImageResult> {
  const token = gatewayToken();
  if (!token) throw new Error("Gateway 토큰 없음(AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN)");
  const dim = resolveSize(req);
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
    n: 1,
    response_format: "b64_json",
    ...(dim ? { size: `${dim.width}x${dim.height}` } : {}),
    ...(req.seed !== undefined ? { seed: req.seed } : {}),
    ...req.extra,
    ...(edit ? { images: req.referenceImages!.map((image_url) => ({ image_url })) } : {}),
  };
  const res = await fetch(`${BASE}/images/${edit ? "edits" : "generations"}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("gateway 응답에 b64_json 없음");
  const bytes = Buffer.from(b64, "base64");
  return { bytes, ext: sniffExt(bytes), model: req.model, provider: "gateway", costUsd: estimateImageCostUsd("gateway", req.model, edit) };
}
