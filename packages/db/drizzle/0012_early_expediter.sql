ALTER TABLE "booking_external_events" DROP CONSTRAINT "booking_external_events_connection_provider_fk";
--> statement-breakpoint
ALTER TABLE "booking_external_events" ADD CONSTRAINT "booking_external_events_connection_provider_fk" FOREIGN KEY ("connection_id","provider") REFERENCES "public"."calendar_connections"("id","provider") ON DELETE no action ON UPDATE no action;