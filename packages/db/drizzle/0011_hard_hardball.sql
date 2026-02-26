ALTER TABLE "booking_external_events" DROP CONSTRAINT "booking_external_events_connection_id_calendar_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "booking_external_events" ADD CONSTRAINT "booking_external_events_connection_provider_fk" FOREIGN KEY ("connection_id","provider") REFERENCES "public"."calendar_connections"("id","provider") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_id_provider_unique" UNIQUE("id","provider");