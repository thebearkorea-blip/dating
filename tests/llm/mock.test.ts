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

it("text 없이 max_tokens로 끝나면 한도를 올려 1회 재시도한다", async () => {
  vi.stubEnv("LLM_PROVIDER", "anthropic");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      ok({ content: [{ type: "thinking" }], stop_reason: "max_tokens", usage: { input_tokens: 5, output_tokens: 160 } }),
    )
    .mockResolvedValueOnce(
      ok({ content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 3 } }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const { anthropicProvider } = await import("../../src/llm/index");
  const r = await anthropicProvider.complete({
    model: CHAT_MODEL,
    maxTokens: 160,
    messages: [{ role: "user", content: "hi" }],
  });
  expect(r.text).toBe("hi");
  expect(r.usage?.outputTokens).toBe(3);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body).max_tokens).toBe(160);
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body).max_tokens).toBe(1024);
  expect(errSpy).toHaveBeenCalledOnce();
  errSpy.mockRestore();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
