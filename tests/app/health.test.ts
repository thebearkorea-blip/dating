import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fail: false }));
vi.mock("@/db/client", () => ({
  getDb: () => ({
    execute: async () => {
      if (state.fail) throw new Error("down");
      return {};
    },
  }),
}));

import { GET } from "../../src/app/api/health/route.js";

describe("GET /api/health", () => {
  it("DB 응답이 있으면 200 {ok:true}", async () => {
    state.fail = false;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("DB 오류면 503", async () => {
    state.fail = true;
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
