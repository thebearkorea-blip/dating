import { z } from "zod";

export const bibleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    age: z.number().int(),
    group_id: z.string().min(1),
    /** 캐릭터별 서사 시작일(ISO, KST). 있으면 이 날이 D-180. 없으면 전역 growth_state.currentRelDay */
    story_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    position: z.array(z.string()),
    personality_direction: z.enum(["warm", "playful", "cool"]),
    members: z.array(
      z
        .object({
          id: z.string().min(1),
          relation: z.string(),
          voice_hint: z.string(),
        })
        .strict(),
    ),
    never: z.array(z.string()),
    affection_stages: z.array(
      z
        .object({
          stage: z.number().int(),
          name: z.string(),
          behaviors: z.array(z.string()),
          reply_delay: z
            .object({ min_min: z.number().nonnegative(), max_min: z.number().nonnegative() })
            .strict(),
          initiative_per_day: z.number().nonnegative(),
          address: z.string(),
        })
        .strict(),
    ),
    knows_nothing_about: z.array(z.string()),
    secrets: z.array(
      z
        .object({
          id: z.string().min(1),
          text: z.string(),
          unlock_stage: z.number().int(),
        })
        .strict(),
    ),
    relationship_breakers: z.array(z.object({ id: z.string().min(1), text: z.string() }).strict()),
    reconcile: z
      .object({
        cooldown_days: z.number().int().nonnegative(),
        requires_sincere_apology: z.literal(true),
      })
      .strict(),
    first_meeting: z.object({ premise: z.string() }).strict(),
    mismatches: z.array(z.string()),
    korean_slip_conditions: z.array(z.string()),
  })
  .strict();

export type Bible = z.infer<typeof bibleSchema>;
