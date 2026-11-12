import { z } from "zod";

/** canon.jsonl 한 행 */
export const canonRowSchema = z
  .object({
    at: z.string().min(1),
    character: z.string().min(1),
    fact: z.string().min(1),
    source: z.enum(["diary", "sns", "event"]),
    event_id: z.string().optional(),
  })
  .strict();

export type CanonRow = z.infer<typeof canonRowSchema>;
