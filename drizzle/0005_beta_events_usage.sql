CREATE TABLE "billing"."llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rel_id" uuid,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input" integer DEFAULT 0 NOT NULL,
	"output" integer DEFAULT 0 NOT NULL,
	"cache_read" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "personal"."ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"msg_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_msg_user_uq" UNIQUE("msg_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "personal"."users" ADD COLUMN "is_beta" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personal"."users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personal"."events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "personal"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal"."ratings" ADD CONSTRAINT "ratings_msg_id_messages_id_fk" FOREIGN KEY ("msg_id") REFERENCES "personal"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal"."ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "personal"."users"("id") ON DELETE no action ON UPDATE no action;