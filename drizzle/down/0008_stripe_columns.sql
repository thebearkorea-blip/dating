-- 0008 되돌리기(수동 실행). drizzle 마이그레이터는 읽지 않는다. 적용 뒤 __drizzle_migrations의 0008 행도 지워야 재적용된다.
ALTER TABLE "billing"."entitlements" DROP CONSTRAINT IF EXISTS "entitlements_stripe_subscription_id_unique";
ALTER TABLE "billing"."entitlements" DROP COLUMN IF EXISTS "stripe_status";
ALTER TABLE "billing"."entitlements" DROP COLUMN IF EXISTS "stripe_subscription_id";
ALTER TABLE "billing"."entitlements" DROP COLUMN IF EXISTS "stripe_customer_id";
