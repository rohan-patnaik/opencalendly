CREATE TABLE "demo_account_daily_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_key" varchar(10) NOT NULL,
	"user_id" uuid NOT NULL,
	"credits_limit" integer NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"is_bypass" boolean DEFAULT false NOT NULL,
	"admitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_account_daily_usage_date_user_unique" UNIQUE("date_key","user_id"),
	CONSTRAINT "demo_account_daily_usage_limit_range" CHECK ("demo_account_daily_usage"."credits_limit" > 0 and "demo_account_daily_usage"."credits_limit" <= 1000000),
	CONSTRAINT "demo_account_daily_usage_used_range" CHECK ("demo_account_daily_usage"."credits_used" >= 0 and "demo_account_daily_usage"."credits_used" <= 1000000)
);
--> statement-breakpoint
CREATE TABLE "demo_admissions_daily" (
	"date_key" varchar(10) PRIMARY KEY NOT NULL,
	"admitted_count" integer DEFAULT 0 NOT NULL,
	"daily_limit" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_admissions_daily_count_range" CHECK ("demo_admissions_daily"."admitted_count" >= 0 and "demo_admissions_daily"."admitted_count" <= 1000000),
	CONSTRAINT "demo_admissions_daily_limit_range" CHECK ("demo_admissions_daily"."daily_limit" > 0 and "demo_admissions_daily"."daily_limit" <= 1000000)
);
--> statement-breakpoint
CREATE TABLE "demo_credit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_key" varchar(10) NOT NULL,
	"user_id" uuid NOT NULL,
	"feature_key" varchar(64) NOT NULL,
	"cost" integer NOT NULL,
	"source_key" varchar(200) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_credit_events_date_user_source_unique" UNIQUE("date_key","user_id","source_key"),
	CONSTRAINT "demo_credit_events_cost_range" CHECK ("demo_credit_events"."cost" > 0 and "demo_credit_events"."cost" <= 1000)
);
--> statement-breakpoint
ALTER TABLE "demo_account_daily_usage" ADD CONSTRAINT "demo_account_daily_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_credit_events" ADD CONSTRAINT "demo_credit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_account_daily_usage_date_user_idx" ON "demo_account_daily_usage" USING btree ("date_key","user_id");--> statement-breakpoint
CREATE INDEX "demo_credit_events_date_user_idx" ON "demo_credit_events" USING btree ("date_key","user_id");