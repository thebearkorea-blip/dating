import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  activeImageProvider, defaultModel, estimateImageCostUsd, generateImage, sizeFromAspect, IMG_MODEL_EDIT, IMG_MODEL_T2I,
} from "../../src/img/index";

function env(v: { IMG_PROVIDER?: string; AI_GATEWAY_API_KEY?: string; VERCEL_OIDC_TOKEN?: string; FAL_KEY?: string }) {
  for (const k of ["IMG_PROVIDER", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "FAL_KEY"] as const) vi.stubEnv(k, v[k] ?? "");
}
afterEach(() => vi.unstubAllEnvs());

it("IMG_PROVIDER가 토큰보다 우선한다", () => {
  env({ IMG_PROVIDER: "mock", AI_GATEWAY_API_KEY: "k", FAL_KEY: "f" });
  expect(activeImageProvider()).toBe("mock");
  env({ IMG_PROVIDER: "fal", AI_GATEWAY_API_KEY: "k" });
  expect(activeImageProvider()).toBe("fal");
  env({ IMG_PROVIDER: "gateway" });
  expect(activeImageProvider()).toBe("gateway");
});

it("강제 없으면 Gateway 토큰 -> FAL_KEY -> mock", () => {
  env({ AI_GATEWAY_API_KEY: "k", FAL_KEY: "f" });
  expect(activeImageProvider()).toBe("gateway");
  env({ VERCEL_OIDC_TOKEN: "t" });
  expect(activeImageProvider()).toBe("gateway");
  env({ FAL_KEY: "f" });
  expect(activeImageProvider()).toBe("fal");
  env({});
  expect(activeImageProvider()).toBe("mock");
});

it("비용 추정", () => {
  expect(estimateImageCostUsd("gateway", IMG_MODEL_T2I)).toBe(0.009);
  expect(estimateImageCostUsd("gateway", IMG_MODEL_EDIT, true)).toBe(0.04);
  expect(estimateImageCostUsd("gateway", "unknown/model")).toBe(0);
  expect(estimateImageCostUsd("fal", "x", true)).toBeCloseTo(0.022);
  expect(estimateImageCostUsd("mock", "x")).toBe(0);
  expect(defaultModel("gateway", true)).toBe(IMG_MODEL_EDIT);
});

it("aspect -> 약 1MP, 16의 배수", () => {
  const { width, height } = sizeFromAspect("3:4");
  expect(width % 16).toBe(0);
  expect(height % 16).toBe(0);
  expect(width / height).toBeCloseTo(0.75, 1);
});

it("mock 생성은 같은 입력에 같은 SVG, 파일로 저장된다", async () => {
  env({ IMG_PROVIDER: "mock" });
  const a = await generateImage({ prompt: "hi", aspect: "3:4", seed: 1 });
  const b = await generateImage({ prompt: "hi", aspect: "3:4", seed: 1 });
  expect(a.ext).toBe("svg");
  expect(a.costUsd).toBe(0);
  expect(a.bytes.equals(b.bytes)).toBe(true);
  const path = join(mkdtempSync(join(tmpdir(), "img-")), `x.${a.ext}`);
  writeFileSync(path, a.bytes);
  expect(readFileSync(path, "utf8")).toContain("<svg");
});
