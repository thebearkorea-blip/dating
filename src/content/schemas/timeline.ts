import { z } from "zod";

export const beatSchema = z
  .object({
    id: z.string().min(1),
    rel_day: z.object({ min: z.number().int(), max: z.number().int() }).strict(),
    requires: z.array(z.string()),
    branch: z.string().nullable(),
    public_text: z.string().min(1),
    kinds: z.array(z.string()),
  })
  .strict()
  .refine((b) => b.rel_day.min <= b.rel_day.max, { message: "rel_day.min must be <= max" });

export const timelineSchema = z.object({ beats: z.array(beatSchema) }).strict();

export type Timeline = z.infer<typeof timelineSchema>;
