import { z } from "zod";

/** photos/manifest.jsonl 한 행 */
export const photoRowSchema = z
  .object({
    id: z.string().min(1),
    blob_url: z.string().min(1),
    public_url: z.string().url().optional(), // Vercel Blob 공개 URL. 있으면 DB 적재가 blob_url 대신 쓴다
    situation: z.string().min(1),
    time_of_day: z.string().min(1),
    place: z.string().min(1),
    face: z.boolean(),
    source: z.enum(["ai", "own", "stock"]).default("ai"),
    license: z.string().optional(),
    credit: z.string().optional(),
    source_url: z.string().optional(),
    model: z.string().optional(),
    audience: z.enum(["public", "private"]),
    used: z.array(z.object({ where: z.string().min(1), at: z.string().min(1), reason: z.string().optional() }).strict()),
  })
  .strict();

export type PhotoRow = z.infer<typeof photoRowSchema>;
