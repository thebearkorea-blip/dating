import { z } from "zod";

export const bibleSchema = z
  .object({
    never: z.array(z.string()),
    affection_stages: z.array(
      z
        .object({
          stage: z.number().int(),
          behaviors: z.array(z.string()),
          reply_delay: z.string(),
          initiative: z.string(),
        })
        .strict(),
    ),
    knows_nothing_about: z.array(z.string()),
  })
  .strict();

export type Bible = z.infer<typeof bibleSchema>;
