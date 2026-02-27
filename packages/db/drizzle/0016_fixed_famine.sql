CREATE TYPE "public"."idempotency_request_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "idempotency_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(64) NOT NULL,
	"idempotency_key_hash" varchar(64) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" "idempotency_request_status" NOT NULL,
	"response_status_code" integer,
	"response_body" jsonb,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_requests_scope_key_hash_unique" UNIQUE("scope","idempotency_key_hash")
);
--> statement-breakpoint
CREATE INDEX "idempotency_requests_scope_created_at_idx" ON "idempotency_requests" USING btree ("scope","created_at");--> statement-breakpoint
CREATE INDEX "idempotency_requests_expires_at_idx" ON "idempotency_requests" USING btree ("expires_at");