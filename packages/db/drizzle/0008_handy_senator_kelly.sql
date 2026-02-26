CREATE TYPE "public"."calendar_provider" AS ENUM('google', 'microsoft');--> statement-breakpoint
CREATE TABLE "calendar_busy_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"source_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_busy_windows_connection_slot_unique" UNIQUE("connection_id","starts_at","ends_at")
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"external_account_id" varchar(255),
	"external_email" varchar(320),
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"last_synced_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connections_user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "calendar_busy_windows" ADD CONSTRAINT "calendar_busy_windows_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_busy_windows" ADD CONSTRAINT "calendar_busy_windows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_busy_windows_user_starts_at_idx" ON "calendar_busy_windows" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_busy_windows_user_provider_starts_at_idx" ON "calendar_busy_windows" USING btree ("user_id","provider","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_connections_user_provider_idx" ON "calendar_connections" USING btree ("user_id","provider");