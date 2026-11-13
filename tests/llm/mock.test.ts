import { expect, it, vi } from "vitest";
import { activeProvider, CHAT_MODEL, mockProvider } from "../../src/llm/index";

it("mock은 같은 입력에 같은 응답, usage 0", async () => {
  const req = { model: CHAT_MODEL, messages: [{ role: "user" as const, content: "hi" }] };
  const a = await mockProvider.complete(req);
  const b = await mockProvider.complete(req);
  expect(a.text).toBe(b.text);
  expect(a.usage).toMatchObject({ inputTokens: 0, outputTokens: 0 });
});

it("LLM_PROVIDER=mock은 키보다 우선한다", () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubEnv("LLM_PROVIDER", "");
  expect(activeProvider()).toBe("anthropic");
  vi.stubEnv("LLM_PROVIDER", "mock");
  expect(activeProvider()).toBe("mock");
  vi.unstubAllEnvs();
});
