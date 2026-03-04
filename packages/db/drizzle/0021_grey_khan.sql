CREATE TYPE "public"."notification_rule_type" AS ENUM('reminder', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."scheduled_notification_status" AS ENUM('pending', 'sent', 'failed', 'canceled');--> statement-breakpoint
ALTER TYPE "public"."email_delivery_type" ADD VALUE 'booking_reminder';--> statement-breakpoint
ALTER TYPE "public"."email_delivery_type" ADD VALUE 'booking_follow_up';--> statement-breakpoint
CREATE TABLE "notification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type_id" uuid NOT NULL,
	"notification_type" "notification_rule_type" NOT NULL,
	"offset_minutes" integer NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_rules_event_type_type_offset_unique" UNIQUE("event_type_id","notification_type","offset_minutes"),
	CONSTRAINT "notification_rules_offset_range" CHECK ("notification_rules"."offset_minutes" > 0 and "notification_rules"."offset_minutes" <= 10080)
);
--> statement-breakpoint
CREATE TABLE "scheduled_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"event_type_id" uuid NOT NULL,
	"notification_rule_id" uuid NOT NULL,
	"notification_type" "notification_rule_type" NOT NULL,
	"recipient_email" varchar(320) NOT NULL,
	"recipient_name" varchar(120) NOT NULL,
	"booking_starts_at" timestamp with time zone NOT NULL,
	"booking_ends_at" timestamp with time zone NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"status" "scheduled_notification_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider" varchar(32) DEFAULT 'none' NOT NULL,
	"provider_message_id" varchar(255),
	"sent_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_notifications_booking_rule_recipient_unique" UNIQUE("booking_id","notification_rule_id","recipient_email"),
	CONSTRAINT "scheduled_notifications_attempt_count_range" CHECK ("scheduled_notifications"."attempt_count" >= 0 and "scheduled_notifications"."attempt_count" <= 100),
	CONSTRAINT "scheduled_notifications_sent_state_check" CHECK ((
        "scheduled_notifications"."status" != 'sent'
      ) OR (
        "scheduled_notifications"."status" = 'sent'
        AND "scheduled_notifications"."sent_at" is not null
      )),
	CONSTRAINT "scheduled_notifications_canceled_state_check" CHECK ((
        "scheduled_notifications"."status" != 'canceled'
      ) OR (
        "scheduled_notifications"."status" = 'canceled'
        AND "scheduled_notifications"."canceled_at" is not null
      ))
);
--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_notification_rule_id_notification_rules_id_fk" FOREIGN KEY ("notification_rule_id") REFERENCES "public"."notification_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_rules_event_type_idx" ON "notification_rules" USING btree ("event_type_id");--> statement-breakpoint
CREATE INDEX "scheduled_notifications_organizer_status_send_at_idx" ON "scheduled_notifications" USING btree ("organizer_id","status","send_at");--> statement-breakpoint
CREATE INDEX "scheduled_notifications_booking_status_send_at_idx" ON "scheduled_notifications" USING btree ("booking_id","status","send_at");--> statement-breakpoint
CREATE INDEX "scheduled_notifications_send_at_idx" ON "scheduled_notifications" USING btree ("send_at");