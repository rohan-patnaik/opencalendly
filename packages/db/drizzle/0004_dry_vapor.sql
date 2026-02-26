CREATE TABLE "demo_credits_daily" (
	"date_key" varchar(10) PRIMARY KEY NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_key" varchar(10) NOT NULL,
	"email" varchar(320) NOT NULL,
	"source" varchar(80) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_daily_email_unique" UNIQUE("date_key","email")
);
