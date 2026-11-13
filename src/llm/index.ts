// 모델 이름과 호출 래퍼는 이 파일에만 둔다. 다른 파일에 모델 문자열을 쓰지 않는다.
// 모델은 "provider/model" 문자열로 지정한다(공급자 교체는 문자열 교체로 흡수).

export type ModelId = `${string}/${string}`;

/** 대화용 */
export const CHAT_MODEL: ModelId = "anthropic/claude-sonnet-5-5";
/** 판단용(검수·분류·기억 추출) */
export const JUDGE_MODEL: ModelId = "anthropic/claude-haiku-5-5";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  model: ModelId;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  text: string;
  model: ModelId;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number };
}

/** 공급자 하나를 감싸는 어댑터. provider 이름은 ModelId의 앞부분. */
export interface LlmProvider {
  readonly provider: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/** "provider/model" 문자열을 분리한다. */
export function parseModelId(id: ModelId): { provider: string; model: string } {
  const i = id.indexOf("/");
  return { provider: id.slice(0, i), model: id.slice(i + 1) };
}

// ---- W2: 호출 구현 ----
// 패키지 설치가 막혀 SDK 없이 Anthropic Messages API를 fetch로 직접 호출한다(공급자: anthropic만).
import { existsSync } from "node:fs";

/** .env, .env.local을 읽는다(이미 있는 환경변수는 덮어쓰지 않는다). */
function loadEnv(): void {
  for (const f of [".env", ".env.local"]) {
    if (existsSync(f)) process.loadEnvFile(f);
  }
}

export function hasLlmKey(): boolean {
  loadEnv();
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** USD / 100만 토큰. 출처: docs/research/2026-11-13-외부서비스-조사.md §4. */
const PRICE_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number }> = {
  [JUDGE_MODEL]: { input: 0.1, output: 0.5, cacheRead: 0.01 },
  [CHAT_MODEL]: { input: 2, output: 10, cacheRead: 0.1 },
};

/** inputTokens는 캐시 읽기를 제외한 입력 토큰(Anthropic usage.input_tokens 기준). */
export function estimateCostUsd(
  model: ModelId,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number },
): number {
  const p = PRICE_PER_MTOK[model];
  if (!p) return 0;
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      (usage.cacheReadTokens ?? 0) * p.cacheRead) /
    1_000_000
  );
}

export const anthropicProvider: LlmProvider = {
  provider: "anthropic",
  async complete(req) {
    loadEnv();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY 없음");
    const { model } = parseModelId(req.model);
    const system = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const messages = req.messages.filter((m) => m.role !== "system");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0,
        ...(system ? { system } : {}),
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
    };
    return {
      text: data.content.map((c) => c.text ?? "").join(""),
      model: req.model,
      usage: data.usage
        ? {
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens,
            cacheReadTokens: data.usage.cache_read_input_tokens ?? 0,
          }
        : undefined,
    };
  },
};

const providers: Record<string, LlmProvider> = { anthropic: anthropicProvider };

export async function complete(req: LlmRequest): Promise<LlmResponse> {
  const p = providers[parseModelId(req.model).provider];
  if (!p) throw new Error(`공급자 없음: ${req.model}`);
  return p.complete(req);
}
