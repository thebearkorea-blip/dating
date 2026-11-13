CREATE TABLE "personal"."disclosures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rel_id" uuid NOT NULL,
	"secret_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disclosures_rel_secret_uq" UNIQUE("rel_id","secret_id")
);
--> statement-breakpoint
ALTER TABLE "personal"."messages" ADD COLUMN "tag" text;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "affection_day" text;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "affection_day_gain" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "affection_ticked_on" text;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "sulk_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "promise_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "pending_breaker" text;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "pending_secret" text;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "reconcile_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "profile_suggestions" jsonb;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal"."disclosures" ADD CONSTRAINT "disclosures_rel_id_relationships_id_fk" FOREIGN KEY ("rel_id") REFERENCES "personal"."relationships"("id") ON DELETE no action ON UPDATE no action;