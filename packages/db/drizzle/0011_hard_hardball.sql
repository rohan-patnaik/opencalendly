ALTER TABLE "booking_external_events" DROP CONSTRAINT "booking_external_events_connection_id_calendar_connections_id_fk";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'calendar_connections_id_provider_unique'
      AND conrelid = 'calendar_connections'::regclass
  ) THEN
    ALTER TABLE "calendar_connections"
      ADD CONSTRAINT "calendar_connections_id_provider_unique" UNIQUE("id","provider");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_external_events_connection_provider_fk'
      AND conrelid = 'booking_external_events'::regclass
  ) THEN
    ALTER TABLE "booking_external_events"
      ADD CONSTRAINT "booking_external_events_connection_provider_fk"
      FOREIGN KEY ("connection_id","provider")
      REFERENCES "public"."calendar_connections"("id","provider")
      ON DELETE set null
      ON UPDATE no action;
  END IF;
END $$;
