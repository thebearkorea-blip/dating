CREATE TABLE "personal"."reactions" (
	"msg_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"by" text NOT NULL,
	"emoji" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_msg_id_by_pk" PRIMARY KEY("msg_id","by")
);
--> statement-breakpoint
ALTER TABLE "personal"."messages" ADD COLUMN "reply_to" uuid;--> statement-breakpoint
ALTER TABLE "personal"."messages" ADD COLUMN "seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal"."reactions" ADD CONSTRAINT "reactions_msg_id_messages_id_fk" FOREIGN KEY ("msg_id") REFERENCES "personal"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal"."reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "personal"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal"."messages" ADD CONSTRAINT "messages_reply_to_messages_id_fk" FOREIGN KEY ("reply_to") REFERENCES "personal"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_rel_deliver_idx" ON "personal"."messages" USING btree ("rel_id","deliver_at","id");