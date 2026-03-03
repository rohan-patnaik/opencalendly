CREATE TABLE "time_off_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"reason" text,
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"source_key" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_off_blocks_user_source_source_key_unique" UNIQUE("user_id","source","source_key"),
	CONSTRAINT "time_off_blocks_end_after_start" CHECK ("time_off_blocks"."end_at" > "time_off_blocks"."start_at")
);
--> statement-breakpoint
ALTER TABLE "time_off_blocks" ADD CONSTRAINT "time_off_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_off_blocks_user_start_at_idx" ON "time_off_blocks" USING btree ("user_id","start_at");--> statement-breakpoint
CREATE INDEX "time_off_blocks_user_range_idx" ON "time_off_blocks" USING btree ("user_id","start_at","end_at");