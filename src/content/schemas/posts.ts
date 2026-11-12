import { z } from "zod";

/** sns/posts.jsonl 한 행 */
export const postRowSchema = z
  .object({
    platform: z.enum(["instagram", "tiktok"]),
    at: z.string().min(1),
    diary: z.string().min(1),
    photos: z.array(z.string()),
    reactions: z.record(z.string(), z.number()),
  })
  .strict();

export type PostRow = z.infer<typeof postRowSchema>;
