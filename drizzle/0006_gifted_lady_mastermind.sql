ALTER TABLE "personal"."users" ADD COLUMN "clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "personal"."users" ADD CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id");