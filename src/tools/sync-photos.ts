// 사용법: node --import tsx src/tools/sync-photos.ts [--dry-run] [--reload] [--character ihan]
// Finder에서 .data/photos/<c>/<id>.jpg를 지운 결과를 manifest·SNS 큐에 반영한다.
//  - 파일 없음 → used에 {where:"rejected", reason:"deleted_by_reviewer"} 추가(이미 rejected면 유지)
//  - 파일 있음 + deleted_by_reviewer로만 rejected → 그 항목 제거(복구)
//  - 폐기된 photo_id를 쓰는 큐 슬라이드 → photo_id:null, _missing:true
//  - --reload: load-content로 media 재적재(DB 접근. dev 서버가 꺼져 있을 때만)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REASON = "deleted_by_reviewer";

export type SyncResult = { character: string; rejected: number; restored: number; queue: number };

function readLines(path: string): string[] {
  return readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "");
}

export function syncPhotos(opts: { root: string; contentDir?: string; today: string; dryRun?: boolean; character?: string }): SyncResult[] {
  const contentDir = opts.contentDir ?? join(opts.root, "content");
  const charsDir = join(contentDir, "characters");
  const results: SyncResult[] = [];
  for (const c of readdirSync(charsDir).sort()) {
    if (opts.character && c !== opts.character) continue;
    const manifestPath = join(charsDir, c, "photos/manifest.jsonl");
    if (!existsSync(manifestPath)) continue;
    const res: SyncResult = { character: c, rejected: 0, restored: 0, queue: 0 };
    const newlyRejected = new Set<string>();

    let manifestChanged = false;
    const manifestOut = readLines(manifestPath).map((line) => {
      const row = JSON.parse(line) as { id: string; blob_url: string; used: Array<{ where: string; at: string; reason?: string }> };
      const exists = existsSync(resolve(opts.root, row.blob_url));
      const rejects = row.used.filter((u) => u.where === "rejected");
      if (!exists && rejects.length === 0) {
        row.used.push({ where: "rejected", at: opts.today, reason: REASON });
        newlyRejected.add(row.id);
        res.rejected++;
        manifestChanged = true;
      } else if (exists && rejects.length > 0 && rejects.every((u) => u.reason === REASON)) {
        row.used = row.used.filter((u) => u.where !== "rejected");
        res.restored++;
        manifestChanged = true;
      }
      return JSON.stringify(row);
    });

    // 큐: 폐기 대상(이번에 폐기 + 이미 deleted_by_reviewer로 폐기된) photo_id를 쓰는 슬라이드를 되돌린다.
    const gone = new Set(newlyRejected);
    for (const line of manifestOut) {
      const r = JSON.parse(line) as { id: string; used: Array<{ where: string; reason?: string }> };
      if (r.used.some((u) => u.where === "rejected" && u.reason === REASON)) gone.add(r.id);
    }
    const queuePath = join(charsDir, c, "sns/queue.jsonl");
    let queueOut: string[] | null = null;
    if (existsSync(queuePath) && gone.size > 0) {
      let queueChanged = false;
      queueOut = readLines(queuePath).map((line) => {
        const row = JSON.parse(line) as { slides?: Array<{ photo_id?: string | null; _missing?: boolean }> };
        for (const s of row.slides ?? []) {
          if (typeof s.photo_id === "string" && gone.has(s.photo_id)) {
            s.photo_id = null;
            s._missing = true;
            res.queue++;
            queueChanged = true;
          }
        }
        return JSON.stringify(row);
      });
      if (!queueChanged) queueOut = null;
    }

    if (!opts.dryRun) {
      if (manifestChanged) writeFileSync(manifestPath, manifestOut.join("\n") + "\n");
      if (queueOut) writeFileSync(queuePath, queueOut.join("\n") + "\n");
    }
    results.push(res);
  }
  return results;
}

// 직접 실행했을 때만 돈다(import 시에는 실행하지 않음).
if (import.meta.url === `file://${resolve(process.argv[1] ?? "")}`) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const ci = args.indexOf("--character");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const results = syncPhotos({ root: process.cwd(), today, dryRun, character: ci >= 0 ? args[ci + 1] : undefined });
  for (const r of results) console.log(`${r.character}: 폐기 ${r.rejected}, 복구 ${r.restored}, 큐 영향 ${r.queue}`);
  const total = results.reduce((n, r) => n + r.rejected + r.restored + r.queue, 0);
  console.log(`${dryRun ? "[dry-run] " : ""}변경 ${total}건`);
  if (args.includes("--reload")) {
    const { loadContent } = await import("../db/load-content");
    const { closeDb, getDb } = await import("../db/client");
    const m = await loadContent(getDb(), resolve("content"));
    console.log(`media 재적재: media ${m.media}행 (${Object.entries(m.perCharacter).map(([k, v]) => `${k} ${v}`).join(", ")})`);
    await closeDb();
  }
}
