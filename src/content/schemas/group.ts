import { z } from "zod";

export const groupSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    concept: z.string().min(1),
    members: z
      .array(z.object({ id: z.string().min(1), role: z.enum(["lead", "support"]) }).strict())
      .min(1),
    t0: z.string().date().nullable(),
  })
  .strict();

export type Group = z.infer<typeof groupSchema>;
