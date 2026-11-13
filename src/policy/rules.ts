import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { guardsSchema, type Guards } from "../content/schemas/guards.js";

export type GuardRule = Guards["rules"][number];
export type Severity = "block" | "flag";

export interface Finding {
  rule_id: string;
  severity: Severity;
  quote: string;
  reason: string;
}

export function loadGuards(path: string): GuardRule[] {
  return guardsSchema.parse(parse(readFileSync(path, "utf8"))).rules;
}

/** 1단: regex 규칙만 실행한다(LLM 없음). */
export function runStage1(text: string, rules: GuardRule[]): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    if (rule.kind !== "regex") continue;
    const m = new RegExp(rule.text, "iu").exec(text);
    if (m) {
      findings.push({
        rule_id: rule.id,
        severity: rule.severity,
        quote: m[0],
        reason: `regex ${rule.id}`,
      });
    }
  }
  return findings;
}
