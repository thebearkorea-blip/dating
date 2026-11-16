-- 0007 되돌리기(수동 실행). drizzle 마이그레이터는 읽지 않는다. 적용 뒤 __drizzle_migrations의 0007 행도 지워야 재적용된다.
DROP INDEX IF EXISTS "personal"."messages_rel_deliver_idx";
ALTER TABLE "personal"."messages" DROP CONSTRAINT IF EXISTS "messages_reply_to_messages_id_fk";
ALTER TABLE "personal"."messages" DROP COLUMN IF EXISTS "reply_to";
ALTER TABLE "personal"."messages" DROP COLUMN IF EXISTS "seen_at";
DROP TABLE IF EXISTS "personal"."reactions";
