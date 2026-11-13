import { parse as parseYaml } from "yaml";
import { z } from "zod";

/** diary/YYYY-MM-DD.md frontmatter */
export const diaryFrontmatterSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rel_day: z.number().int(),
    activity: z.string().min(1),
    mood: z.string().min(1),
    photos: z.array(z.string().min(1)),
    audience: z.literal("public"),
  })
  .strict();

export type DiaryFrontmatter = z.infer<typeof diaryFrontmatterSchema>;

/** `---` 구분 frontmatter를 분리한다. frontmatter가 없으면 null. */
export function splitFrontmatter(text: string): { data: unknown; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  return { data: parseYaml(m[1] as string), body: m[2] as string };
}
