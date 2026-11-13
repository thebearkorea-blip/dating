// 개발 전용 mock: 프롬프트·시드로 색을 정한 단색 SVG. 출시 금지(index.ts에서 assertDevOnly).
import { resolveSize, type ImageRequest, type ImageResult } from "./index.js";

export function generateMock(req: ImageRequest & { model: string }): ImageResult {
  let h = req.seed ?? 0;
  for (const ch of req.prompt) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const { width, height } = resolveSize(req) ?? { width: 768, height: 1024 };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="hsl(${h % 360},40%,60%)"/></svg>`;
  return { bytes: Buffer.from(svg), ext: "svg", model: req.model, provider: "mock", costUsd: 0 };
}
