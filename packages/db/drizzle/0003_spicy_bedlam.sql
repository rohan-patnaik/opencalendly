CREATE TABLE "booking_action_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"action_type" varchar(20) NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_action_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "booking_action_tokens_booking_action_unique" UNIQUE("booking_id","action_type")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rescheduled_from_booking_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "canceled_by" varchar(32);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "booking_action_tokens" ADD CONSTRAINT "booking_action_tokens_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_action_tokens" ADD CONSTRAINT "booking_action_tokens_consumed_booking_id_bookings_id_fk" FOREIGN KEY ("consumed_booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rescheduled_from_booking_id_bookings_id_fk" FOREIGN KEY ("rescheduled_from_booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;