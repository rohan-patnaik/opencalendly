ALTER TABLE "event_types" ADD COLUMN "daily_booking_limit" integer;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "weekly_booking_limit" integer;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "monthly_booking_limit" integer;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_daily_booking_limit_positive" CHECK ("event_types"."daily_booking_limit" is null or "event_types"."daily_booking_limit" > 0);--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_weekly_booking_limit_positive" CHECK ("event_types"."weekly_booking_limit" is null or "event_types"."weekly_booking_limit" > 0);--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_monthly_booking_limit_positive" CHECK ("event_types"."monthly_booking_limit" is null or "event_types"."monthly_booking_limit" > 0);