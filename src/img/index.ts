// 이미지 생성 공급자 추상화. 모델 이름·단가·공급자 분기는 이 폴더에만 둔다.
// 공급자: gateway(Vercel AI Gateway REST) | fal(fal 큐 REST) | mock(단색 SVG, 개발 전용).
import { existsSync } from "node:fs";
import { assertDevOnly } from "../dev-only.js";
import { generateGateway } from "./gateway.js";
import { generateFal, FAL_MODEL_T2I, FAL_MODEL_EDIT, FAL_USD_PER_MP } from "./fal.js";
import { generateMock } from "./mock.js";

export type ImgProvider = "gateway" | "fal" | "mock";

/** 후보 생성(텍스트 -> 이미지) 기본 모델(Gateway). */
export const IMG_MODEL_T2I = "bfl/flux-3-image-klein";
/** 참조 이미지 편집 기본 모델(Gateway). docs의 /v1/images/edits 지원 목록(flux-kontext-pro, gemini-3.1-flash-image, gpt-image-2, grok-imagine)에
 * seedream-4.5가 없어 kontext-pro로 한다. 출처: vercel.com/docs/ai-gateway/modalities/image-generation/openai "Editing images". */
export const IMG_MODEL_EDIT = "bfl/flux-kontext-pro";

/** Gateway 장당 단가(USD). 출처: GET https://ai-gateway.vercel.sh/v1/models pricing.image (2026-11-13). */
export const GATEWAY_USD_PER_IMAGE: Record<string, number> = {
  "bfl/flux-3-image-klein": 0.009, // 1024x1024 기준(해상도별 0.008~0.036)
  "bfl/flux-2-klein-4b": 0.009, // 목록에 단가 없음 -> klein과 같다고 추정
  "bytedance/seedream-4.5": 0.04,
  "bytedance/seedream-5.0-lite": 0.035,
  "bfl/flux-kontext-pro": 0.04,
  "google/gemini-3.1-flash-image": 0.04, // 목록에 단가 없음 -> 추정
};

export interface ImageRequest {
  prompt: string;
  /** "WxH" 픽셀. aspect와 둘 다 있으면 size가 이긴다. */
  size?: string;
  /** "W:H" 비율(예 "3:4"). 약 1MP로 환산한다. */
  aspect?: string;
  /** 참조 이미지(https URL 또는 data URL). 있으면 편집 모델을 쓴다. */
  referenceImages?: string[];
  seed?: number;
  model?: string;
}

export interface ImageResult {
  bytes: Buffer;
  /** 공급자가 URL을 준 경우(fal). 만료될 수 있으니 저장은 bytes로 한다. */
  url?: string;
  ext: "png" | "jpg" | "svg";
  model: string;
  provider: ImgProvider;
  costUsd: number;
}

function loadEnv(): void {
  for (const f of [".env", ".env.local"]) {
    if (existsSync(f)) process.loadEnvFile(f);
  }
}

export function gatewayToken(): string | undefined {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || undefined;
}

/** IMG_PROVIDER(gateway|fal|mock)가 이긴다. 없으면 Gateway 토큰 -> FAL_KEY -> mock. */
export function activeImageProvider(): ImgProvider {
  loadEnv();
  const forced = process.env.IMG_PROVIDER;
  if (forced === "mock") assertDevOnly("IMG_PROVIDER=mock");
  if (forced === "gateway" || forced === "fal" || forced === "mock") return forced;
  if (gatewayToken()) return "gateway";
  if (process.env.FAL_KEY) return "fal";
  return "mock";
}

export function defaultModel(provider: ImgProvider, edit: boolean): string {
  if (provider === "gateway") return edit ? IMG_MODEL_EDIT : IMG_MODEL_T2I;
  if (provider === "fal") return edit ? FAL_MODEL_EDIT : FAL_MODEL_T2I;
  return "mock/solid-svg";
}

/** 장당 예상 비용(USD). 모르는 모델은 0. fal은 출력 1MP(편집은 입력 1MP 추가)로 추정한다. */
export function estimateImageCostUsd(provider: ImgProvider, model: string, edit = false): number {
  if (provider === "gateway") return GATEWAY_USD_PER_IMAGE[model] ?? 0;
  if (provider === "fal") return (edit ? 2 : 1) * FAL_USD_PER_MP;
  return 0;
}

/** "3:4" 또는 "WxH" -> 약 1MP, 16의 배수 픽셀. */
export function sizeFromAspect(aspect: string): { width: number; height: number } {
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h) throw new Error(`aspect 형식 오류: ${aspect}`);
  const r = w / h;
  const round16 = (x: number) => Math.max(16, Math.round(x / 16) * 16);
  const width = round16(Math.sqrt(1_000_000 * r));
  return { width, height: round16(width / r) };
}

export function resolveSize(req: Pick<ImageRequest, "size" | "aspect">): { width: number; height: number } | undefined {
  if (req.size) {
    const [width, height] = req.size.split("x").map(Number);
    if (!width || !height) throw new Error(`size 형식 오류: ${req.size}`);
    return { width, height };
  }
  return req.aspect ? sizeFromAspect(req.aspect) : undefined;
}

export function sniffExt(b: Buffer): "png" | "jpg" {
  return b[0] === 0xff && b[1] === 0xd8 ? "jpg" : "png";
}

export function toDataUrl(r: Pick<ImageResult, "bytes" | "ext">): string {
  const mime = r.ext === "jpg" ? "image/jpeg" : r.ext === "svg" ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${r.bytes.toString("base64")}`;
}

export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  const provider = activeImageProvider();
  const edit = !!req.referenceImages?.length;
  const model = req.model ?? defaultModel(provider, edit);
  if (provider === "gateway") return generateGateway({ ...req, model }, edit);
  if (provider === "fal") return generateFal({ ...req, model }, edit);
  assertDevOnly("IMG mock 생성");
  return generateMock({ ...req, model });
}
