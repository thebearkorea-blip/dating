import { z } from "zod";

export const groupSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    concept: z.string().min(1),
    company: z
      .object({ id: z.string().min(1), name: z.string().min(1), note: z.string() })
      .strict(),
    t0: z.string().date().nullable(),
    debut_window_months: z.tuple([z.number().int(), z.number().int()]),
    language_of_content: z.string().min(1),
    members: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            name_en: z.string().min(1),
            age: z.number().int(),
            role: z.string().min(1).optional(),
            position: z.array(z.string()),
            relation: z.string(),
            voice: z.string(),
            status: z.enum(["trainee", "debuted", "eliminated"]).optional(),
            archetype: z.string().optional(),
            look: z.string().optional(),
            vibe: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
    notes: z.array(z.string()),
  })
  .strict();

export type Group = z.infer<typeof groupSchema>;
