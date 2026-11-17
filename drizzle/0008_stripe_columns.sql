ALTER TABLE "billing"."entitlements" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "billing"."entitlements" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "billing"."entitlements" ADD COLUMN "stripe_status" text;--> statement-breakpoint
ALTER TABLE "billing"."entitlements" ADD CONSTRAINT "entitlements_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");