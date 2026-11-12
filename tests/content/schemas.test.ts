import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateContentDir, validateJsonlText, validateYamlText } from "../../src/content/load.js";
import { canonRowSchema, groupSchema } from "../../src/content/schemas/index.js";

const EX = join(import.meta.dirname, "../fixtures/content-example");
const read = (p: string) => readFileSync(join(EX, p), "utf8");

describe("content-example", () => {
  it("passes all schemas", () => {
    const r = validateContentDir(EX);
    expect(r.issues).toEqual([]);
    expect(r.checked).toHaveLength(8);
  });
});

describe("rejections", () => {
  it("rejects a missing required field (group.yaml without name)", () => {
    const text = read("world/group.yaml").replace(/^name:.*\n/m, "");
    const errs = validateYamlText(text, groupSchema);
    expect(errs.some((e) => e.startsWith("name:"))).toBe(true);
  });

  it("rejects an unknown field (canon.jsonl row with extra key)", () => {
    const row = JSON.parse(read("world/canon.jsonl").trim());
    const errs = validateJsonlText(JSON.stringify({ ...row, extra: 1 }), canonRowSchema);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toContain("line 1");
  });

  it("rejects an unknown field in yaml (strict)", () => {
    const errs = validateYamlText(read("world/group.yaml") + "extra: 1\n", groupSchema);
    expect(errs.length).toBeGreaterThan(0);
  });
});
