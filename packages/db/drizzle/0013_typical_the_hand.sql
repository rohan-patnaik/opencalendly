CREATE TYPE "public"."analytics_funnel_stage" AS ENUM('page_view', 'slot_selection', 'booking_confirmed');--> statement-breakpoint
CREATE TYPE "public"."email_delivery_status" AS ENUM('succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_delivery_type" AS ENUM('booking_confirmation', 'booking_cancellation', 'booking_rescheduled');--> statement-breakpoint
CREATE TABLE "analytics_funnel_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_id" uuid NOT NULL,
	"event_type_id" uuid NOT NULL,
	"team_event_type_id" uuid,
	"stage" "analytics_funnel_stage" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_id" uuid NOT NULL,
	"booking_id" uuid,
	"event_type_id" uuid,
	"recipient_email" varchar(320) NOT NULL,
	"email_type" "email_delivery_type" NOT NULL,
	"status" "email_delivery_status" NOT NULL,
	"provider" varchar(32) DEFAULT 'none' NOT NULL,
	"provider_message_id" varchar(255),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_funnel_events" ADD CONSTRAINT "analytics_funnel_events_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_funnel_events" ADD CONSTRAINT "analytics_funnel_events_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_funnel_events" ADD CONSTRAINT "analytics_funnel_events_team_event_type_id_team_event_types_id_fk" FOREIGN KEY ("team_event_type_id") REFERENCES "public"."team_event_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_funnel_events_organizer_occurred_at_idx" ON "analytics_funnel_events" USING btree ("organizer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_funnel_events_organizer_stage_occurred_at_idx" ON "analytics_funnel_events" USING btree ("organizer_id","stage","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_funnel_events_event_type_occurred_at_idx" ON "analytics_funnel_events" USING btree ("event_type_id","occurred_at");--> statement-breakpoint
CREATE INDEX "email_deliveries_organizer_created_at_idx" ON "email_deliveries" USING btree ("organizer_id","created_at");--> statement-breakpoint
CREATE INDEX "email_deliveries_organizer_status_created_at_idx" ON "email_deliveries" USING btree ("organizer_id","status","created_at");--> statement-breakpoint
CREATE INDEX "email_deliveries_booking_created_at_idx" ON "email_deliveries" USING btree ("booking_id","created_at");