import { z } from "zod";

export const guardRuleSchema = z
  .object({
    id: z.string().min(1),
    scope: z.enum(["input", "output", "content"]),
    kind: z.enum(["regex", "classifier"]),
    severity: z.enum(["block", "flag"]),
    text: z.string().min(1),
  })
  .strict();

export const guardsSchema = z.object({ rules: z.array(guardRuleSchema) }).strict();

export type Guards = z.infer<typeof guardsSchema>;
