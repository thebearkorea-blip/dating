CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE SCHEMA "collective";
--> statement-breakpoint
CREATE SCHEMA "world";
--> statement-breakpoint
CREATE SCHEMA "personal";
--> statement-breakpoint
CREATE TABLE "billing"."entitlements" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"daily_quota" integer DEFAULT 0 NOT NULL,
	"quota_used_today" integer DEFAULT 0 NOT NULL,
	"quota_exhausted_at" timestamp with time zone,
	"call_credits" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collective"."activity_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"active_users" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"feed_views" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collective"."growth_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"current_rel_day" integer NOT NULL,
	"speed" real DEFAULT 1 NOT NULL,
	"pending_beats" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collective"."vote_tallies" (
	"event_id" text NOT NULL,
	"choice" text NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "vote_tallies_event_id_choice_pk" PRIMARY KEY("event_id","choice")
);
--> statement-breakpoint
CREATE TABLE "collective"."votes" (
	"user_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"choice" text NOT NULL,
	CONSTRAINT "votes_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "world"."canon_facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" text NOT NULL,
	"character" text NOT NULL,
	"fact" text NOT NULL,
	"source" text NOT NULL,
	"event_id" text
);
--> statement-breakpoint
CREATE TABLE "world"."characters" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"group_name" text NOT NULL,
	"name" text NOT NULL,
	"name_en" text NOT NULL,
	"age" integer NOT NULL,
	"role" text,
	"bible" jsonb NOT NULL,
	"voice_md" text NOT NULL,
	"schedule" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."media" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"kind" text DEFAULT 'photo' NOT NULL,
	"tags" jsonb NOT NULL,
	"audience" text NOT NULL,
	"face" boolean NOT NULL,
	"blob_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."world_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"canon" jsonb,
	"source" text NOT NULL,
	"rel_day" integer,
	"timeline_beat_id" text
);
--> statement-breakpoint
CREATE TABLE "personal"."memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rel_id" uuid NOT NULL,
	"fact" text NOT NULL,
	"learned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_msg_id" uuid,
	"user_visible" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "personal"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rel_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"sender" text NOT NULL,
	"text" text NOT NULL,
	"media_id" text,
	"tts_url" text,
	"origin" text
);
--> statement-breakpoint
CREATE TABLE "personal"."platform_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"user_id" uuid,
	"seed_memory" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "platform_identities_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "personal"."relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" text NOT NULL,
	"mode" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"stage" integer DEFAULT 1 NOT NULL,
	"affection" integer DEFAULT 0 NOT NULL,
	"sulk_state" text DEFAULT 'none' NOT NULL,
	"last_contact_at" timestamp with time zone,
	"push_window" jsonb,
	"push_max" integer,
	"profile" jsonb,
	"ended_at" timestamp with time zone,
	CONSTRAINT "relationships_user_character_uq" UNIQUE("user_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "personal"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"city" text,
	"tz" text,
	"birth_year" integer,
	"birth_year_verified" boolean DEFAULT false NOT NULL,
	"age_band" text,
	"ai_notice_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal"."memories" ADD CONSTRAINT "memories_rel_id_relationships_id_fk" FOREIGN KEY ("rel_id") REFERENCES "personal"."relationships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal"."messages" ADD CONSTRAINT "messages_rel_id_relationships_id_fk" FOREIGN KEY ("rel_id") REFERENCES "personal"."relationships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal"."platform_identities" ADD CONSTRAINT "platform_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "personal"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD CONSTRAINT "relationships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "personal"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal"."relationships" ADD CONSTRAINT "relationships_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "world"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canon_facts_uq" ON "world"."canon_facts" USING btree ("at","character","fact");--> statement-breakpoint
CREATE INDEX "media_character_idx" ON "world"."media" USING btree ("character_id");