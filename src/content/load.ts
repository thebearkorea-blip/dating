import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ZodType } from "zod";
import {
  bibleSchema,
  canonRowSchema,
  groupSchema,
  guardsSchema,
  photoRowSchema,
  postRowSchema,
  scheduleSchema,
  timelineSchema,
} from "./schemas/index.js";

export interface ContentIssue {
  file: string;
  message: string;
}

export interface ContentReport {
  checked: string[];
  issues: ContentIssue[];
}

function formatZod(err: { issues: { path: PropertyKey[]; message: string }[] }): string[] {
  return err.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`);
}

export function validateYamlText(text: string, schema: ZodType): string[] {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (e) {
    return [`YAML parse error: ${(e as Error).message}`];
  }
  const r = schema.safeParse(data);
  return r.success ? [] : formatZod(r.error);
}

export function validateJsonlText(text: string, schema: ZodType): string[] {
  const out: string[] = [];
  text.split("\n").forEach((line, idx) => {
    if (line.trim() === "") return;
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch (e) {
      out.push(`line ${idx + 1}: JSON parse error: ${(e as Error).message}`);
      return;
    }
    const r = schema.safeParse(data);
    if (!r.success) for (const m of formatZod(r.error)) out.push(`line ${idx + 1}: ${m}`);
  });
  return out;
}

function checkFile(
  root: string,
  path: string,
  kind: "yaml" | "jsonl",
  schema: ZodType,
  report: ContentReport,
): void {
  if (!existsSync(path)) return;
  const rel = relative(root, path);
  report.checked.push(rel);
  const text = readFileSync(path, "utf8");
  const msgs = kind === "yaml" ? validateYamlText(text, schema) : validateJsonlText(text, schema);
  for (const message of msgs) report.issues.push({ file: rel, message });
}

/** content 폴더(world/·characters/<id>/·policy/)의 존재하는 파일을 전부 검증한다. */
export function validateContentDir(root: string): ContentReport {
  const report: ContentReport = { checked: [], issues: [] };
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    report.issues.push({ file: root, message: "directory not found" });
    return report;
  }
  checkFile(root, join(root, "world/group.yaml"), "yaml", groupSchema, report);
  checkFile(root, join(root, "world/timeline.yaml"), "yaml", timelineSchema, report);
  checkFile(root, join(root, "world/canon.jsonl"), "jsonl", canonRowSchema, report);
  checkFile(root, join(root, "policy/guards.yaml"), "yaml", guardsSchema, report);

  const charsDir = join(root, "characters");
  if (existsSync(charsDir)) {
    for (const id of readdirSync(charsDir)) {
      const dir = join(charsDir, id);
      if (!statSync(dir).isDirectory()) continue;
      checkFile(root, join(dir, "bible.yaml"), "yaml", bibleSchema, report);
      checkFile(root, join(dir, "schedule.yaml"), "yaml", scheduleSchema, report);
      checkFile(root, join(dir, "photos/manifest.jsonl"), "jsonl", photoRowSchema, report);
      checkFile(root, join(dir, "sns/posts.jsonl"), "jsonl", postRowSchema, report);
    }
  }
  if (report.checked.length === 0 && report.issues.length === 0) {
    report.issues.push({ file: root, message: "no content files found" });
  }
  return report;
}
