CREATE TYPE "public"."calendar_writeback_operation" AS ENUM('create', 'cancel', 'reschedule');--> statement-breakpoint
CREATE TYPE "public"."calendar_writeback_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "booking_external_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"organizer_id" uuid NOT NULL,
	"connection_id" uuid,
	"provider" "calendar_provider" NOT NULL,
	"operation" "calendar_writeback_operation" DEFAULT 'create' NOT NULL,
	"status" "calendar_writeback_status" DEFAULT 'pending' NOT NULL,
	"external_event_id" varchar(255),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_external_events_booking_provider_unique" UNIQUE("booking_id","provider"),
	CONSTRAINT "booking_external_events_attempt_count_check" CHECK ("booking_external_events"."attempt_count" >= 0),
	CONSTRAINT "booking_external_events_max_attempts_check" CHECK ("booking_external_events"."max_attempts" >= 1)
);
--> statement-breakpoint
ALTER TABLE "booking_external_events" ADD CONSTRAINT "booking_external_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_external_events" ADD CONSTRAINT "booking_external_events_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_external_events" ADD CONSTRAINT "booking_external_events_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_external_events_organizer_status_next_attempt_idx" ON "booking_external_events" USING btree ("organizer_id","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "booking_external_events_status_next_attempt_idx" ON "booking_external_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "booking_external_events_connection_idx" ON "booking_external_events" USING btree ("connection_id");