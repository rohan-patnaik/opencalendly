ALTER TABLE "booking_external_events" DROP CONSTRAINT "booking_external_events_booking_provider_unique";--> statement-breakpoint
ALTER TABLE "booking_external_events" DROP CONSTRAINT "booking_external_events_connection_provider_fk";
--> statement-breakpoint
ALTER TABLE "calendar_connections" DROP CONSTRAINT "calendar_connections_user_provider_unique";--> statement-breakpoint
ALTER TABLE "calendar_connections" DROP CONSTRAINT "calendar_connections_id_provider_unique";--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "use_for_conflict_checks" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD COLUMN "use_for_writeback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_external_events" ADD CONSTRAINT "booking_external_events_connection_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_connections_user_writeback_idx" ON "calendar_connections" USING btree ("user_id","use_for_writeback");--> statement-breakpoint
CREATE INDEX "calendar_connections_user_conflict_checks_idx" ON "calendar_connections" USING btree ("user_id","use_for_conflict_checks");--> statement-breakpoint
ALTER TABLE "booking_external_events" ADD CONSTRAINT "booking_external_events_booking_connection_unique" UNIQUE("booking_id","connection_id");--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_provider_external_account_unique" UNIQUE("provider","external_account_id");
