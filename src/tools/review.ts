import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { outcome, review, type Outcome, type Verdict } from "../policy/reviewer.js";

const args = process.argv.slice(2);
const json = args.includes("--json");
const noLlm = args.includes("--no-llm");
const chIdx = args.indexOf("--character");
const chArg = chIdx >= 0 ? args[chIdx + 1] : undefined;
const inputs = args.filter((a, i) => !a.startsWith("--") && !(chIdx >= 0 && i === chIdx + 1));
if (inputs.length === 0) {
  console.error("usage: tsx src/tools/review.ts <file|dir>... [--json] [--no-llm] [--character <id>]");
  process.exit(2);
}

function collect(p: string): string[] {
  if (!statSync(p).isDirectory()) return [p];
  return readdirSync(p)
    .sort()
    .flatMap((n) => collect(join(p, n)))
    .filter((f) => f.endsWith(".md"));
}

const HEADER = /^<!--\s*expect:\s*(block|flag|pass)\s*;\s*rule:\s*(\S+)\s*-->\s*\n?/;

interface Row {
  file: string;
  expect?: Outcome;
  got: Outcome;
  stage2: Verdict["stage2"];
  status: "ok" | "MISS" | "MISMATCH" | "skip(2단 필요)" | "";
  verdict: Verdict;
}

const rows: Row[] = [];
for (const p of inputs.flatMap((i) => collect(resolve(i)))) {
  const raw = readFileSync(p, "utf8");
  const h = HEADER.exec(raw);
  const inferred = /content\/characters\/([^/]+)\//.exec(p.split("\\").join("/"))?.[1];
  const verdict = await review(raw.replace(HEADER, ""), { useLlm: !noLlm, characterId: chArg ?? inferred });
  const got = outcome(verdict);
  const expect = h ? (h[1] as Outcome) : undefined;
  let status: Row["status"] = "";
  if (expect) {
    if (got === expect) status = "ok";
    else if (verdict.stage2 === "skipped" && expect !== "pass") status = "skip(2단 필요)";
    else status = expect !== "pass" && got === "pass" ? "MISS" : "MISMATCH";
  }
  rows.push({ file: relative(process.cwd(), p), expect, got, stage2: verdict.stage2, status, verdict });
}

if (json) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  for (const r of rows) {
    const u = r.verdict.usage;
    const ids = r.verdict.findings.map((f) => `${f.rule_id}(${f.severity})`).join(",") || "-";
    console.log(
      `${r.file} | expect=${r.expect ?? "-"} got=${r.got} ${r.status} | 2단=${r.stage2} | ${ids} | tokens in=${u.inputTokens} out=${u.outputTokens} cost=$${u.costUsd.toFixed(6)}`,
    );
  }
  const n = (s: string) => rows.filter((r) => r.status === s).length;
  const tot = rows.reduce((a, r) => a + r.verdict.usage.inputTokens + r.verdict.usage.outputTokens, 0);
  const cost = rows.reduce((a, r) => a + r.verdict.usage.costUsd, 0);
  console.log(
    `\n합계 ${rows.length}건: ok=${n("ok")} MISS(위반 통과)=${n("MISS")} MISMATCH=${n("MISMATCH")} skip(2단 필요)=${n("skip(2단 필요)")} | tokens=${tot} cost=$${cost.toFixed(6)}`,
  );
  if (rows.some((r) => r.stage2 === "skipped")) console.log("2단 미검증: API 키 없음 또는 --no-llm");
}
process.exit(rows.some((r) => r.status === "MISS" || r.status === "MISMATCH") ? 1 : 0);
