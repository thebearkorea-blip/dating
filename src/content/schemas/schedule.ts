import { z } from "zod";

const block = z
  .object({
    time: z.string().min(1),
    activity: z.string().min(1),
    busy: z.number().int().min(0).max(3),
    initiative_ok: z.boolean(),
    photo_tags: z.array(z.string().min(1)).optional(),
    note: z.string().optional(),
  })
  .strict();

const day = z.array(block);

export const scheduleSchema = z
  .object({
    timezone: z.string().min(1),
    week_template: z
      .object({
        weekday: day,
        mon: day,
        tue: day,
        wed: day,
        thu: day,
        fri: day,
        sat: day,
        sun: day,
      })
      .strict(),
    reply_delay_multiplier: z.record(z.string(), z.number().positive()),
    random_events: z.array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().min(1),
          probability: z.number().min(0).max(1),
          duration_days: z.tuple([z.number().int(), z.number().int()]),
          effect: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
        })
        .strict(),
    ),
    exception_rules: z.array(z.string().min(1)),
  })
  .strict();

export type Schedule = z.infer<typeof scheduleSchema>;
