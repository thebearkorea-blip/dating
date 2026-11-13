import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { hasPillow, makePack, wrapText } from "../../src/tools/make-post-pack";

const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";

it("wrapText는 긴 문장을 줄바꿈한다", () => {
  expect(wrapText("a ".repeat(40)).split("\n").length).toBeGreaterThan(1);
});

it.skipIf(!existsSync(FFMPEG) || !existsSync(FFPROBE) || !hasPillow())("게시 팩 1개 생성: 파일 수·1080x1350", () => {
  const root = mkdtempSync(join(tmpdir(), "pack-test-"));
  const img = join(root, "p1.jpg");
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=400x300", "-frames:v", "1", img]);
  const res = makePack(
    {
      date: "2026-11-17",
      platform: "tiktok",
      caption: "cap",
      hashtags: ["#a", "#b"],
      post_time_kst: "22:30",
      slides: [
        { photo_id: "p1", text_overlay: "Five a.m. 새벽 연습" },
        { photo_id: null, text_overlay: "skip" },
        { photo_id: "missing", text_overlay: "skip" },
      ],
    },
    new Map([["p1", img], ["missing", "nope.jpg"]]),
    { root, character: "t", outRoot: join(root, "out") },
  );
  expect(res.slides).toBe(1);
  expect(res.warnings).toHaveLength(2);
  expect(readdirSync(res.dir).sort()).toEqual(["caption.txt", "meta.json", "slide-01.jpg"]);
  const size = execFileSync(FFPROBE, ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(res.dir, "slide-01.jpg")]).toString().trim();
  expect(size).toBe("1080,1350");
  expect(readFileSync(join(res.dir, "caption.txt"), "utf8")).toBe("cap\n\n#a #b\n");
  expect(JSON.parse(readFileSync(join(res.dir, "meta.json"), "utf8")).ai_label).toBe(true);
});
