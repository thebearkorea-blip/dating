import { z } from "zod";

export const scheduleSchema = z
  .object({
    weekly: z.array(
      z
        .object({
          day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
          time: z.string().min(1),
          activity: z.string().min(1),
          busy: z.number().int().min(0).max(3),
        })
        .strict(),
    ),
    exceptions: z.array(z.object({ id: z.string().min(1), rule: z.string().min(1) }).strict()),
    random_events: z.array(
      z
        .object({
          id: z.string().min(1),
          probability: z.number().min(0).max(1),
          effect: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export type Schedule = z.infer<typeof scheduleSchema>;
