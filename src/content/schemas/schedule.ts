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

const weekTemplate = z
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
  .strict();

/** 단계별 주간 템플릿. rel_day가 [from_rel_day, to_rel_day](양 끝 포함)일 때 week_template 대신 쓴다. */
const phase = z
  .object({
    from_rel_day: z.number().int(),
    to_rel_day: z.number().int(),
    week_template: weekTemplate,
  })
  .strict()
  .refine((p) => p.from_rel_day <= p.to_rel_day, { message: "from_rel_day must be <= to_rel_day" });

export const scheduleSchema = z
  .object({
    timezone: z.string().min(1),
    /** 기본 템플릿(phases에 해당하는 단계가 없을 때). */
    week_template: weekTemplate,
    phases: z.array(phase).optional(),
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
