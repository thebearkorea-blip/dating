import { resolve } from "node:path";
import { validateContentDir } from "../content/load.js";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: tsx src/tools/validate-content.ts <content-dir>");
  process.exit(2);
}

const report = validateContentDir(resolve(dir));
if (report.issues.length === 0) {
  console.log(`OK (${report.checked.length} files)`);
} else {
  for (const i of report.issues) console.error(`${i.file}: ${i.message}`);
  process.exit(1);
}
