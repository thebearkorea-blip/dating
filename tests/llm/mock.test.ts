import { expect, it } from "vitest";
import { CHAT_MODEL, mockProvider } from "../../src/llm/index";

it("mock은 같은 입력에 같은 응답, usage 0", async () => {
  const req = { model: CHAT_MODEL, messages: [{ role: "user" as const, content: "hi" }] };
  const a = await mockProvider.complete(req);
  const b = await mockProvider.complete(req);
  expect(a.text).toBe(b.text);
  expect(a.usage).toMatchObject({ inputTokens: 0, outputTokens: 0 });
});
