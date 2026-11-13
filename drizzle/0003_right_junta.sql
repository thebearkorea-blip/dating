ALTER TABLE "billing"."entitlements" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."entitlements" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."entitlements" ADD COLUMN "paywall_shown_day" text;