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
  usage?: { inputTokens: number; outputTokens: number };
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

// TODO(W2): 공급자 레지스트리와 complete() 호출 구현(AI Gateway). 지금은 인터페이스만.
