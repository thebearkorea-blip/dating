CREATE TABLE "personal"."review_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rel_id" uuid NOT NULL,
	"message_id" uuid,
	"rule_id" text NOT NULL,
	"severity" text NOT NULL,
	"quote" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing"."entitlements" ADD COLUMN "quota_day" text;--> statement-breakpoint
ALTER TABLE "personal"."messages" ADD COLUMN "deliver_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD COLUMN "memory_cursor_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal"."review_findings" ADD CONSTRAINT "review_findings_rel_id_relationships_id_fk" FOREIGN KEY ("rel_id") REFERENCES "personal"."relationships"("id") ON DELETE no action ON UPDATE no action;