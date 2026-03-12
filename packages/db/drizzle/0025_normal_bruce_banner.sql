CREATE TABLE "request_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(64) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"window_starts_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_rate_limits_scope_key_hash_window_unique" UNIQUE("scope","key_hash","window_starts_at"),
	CONSTRAINT "request_rate_limits_count_range" CHECK ("request_rate_limits"."count" > 0 and "request_rate_limits"."count" <= 1000000)
);
--> statement-breakpoint
CREATE INDEX "request_rate_limits_scope_window_idx" ON "request_rate_limits" USING btree ("scope","window_starts_at");--> statement-breakpoint
CREATE INDEX "request_rate_limits_updated_at_idx" ON "request_rate_limits" USING btree ("updated_at");