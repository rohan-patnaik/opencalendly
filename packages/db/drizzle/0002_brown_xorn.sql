ALTER TABLE "bookings" DROP CONSTRAINT "bookings_unique_slot";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_unique_slot" UNIQUE("organizer_id","starts_at","ends_at");