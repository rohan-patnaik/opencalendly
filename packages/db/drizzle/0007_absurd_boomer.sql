CREATE TYPE "public"."team_member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."team_scheduling_mode" AS ENUM('round_robin', 'collective');--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_owner_slug_unique";--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "team_event_types" ALTER COLUMN "mode" SET DATA TYPE team_scheduling_mode USING "mode"::team_scheduling_mode;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "role" SET DATA TYPE team_member_role USING "role"::team_member_role;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'member'::team_member_role;--> statement-breakpoint
ALTER TABLE "team_booking_assignments" ADD CONSTRAINT "team_booking_assignments_member_fk" FOREIGN KEY ("team_event_type_id","user_id") REFERENCES "public"."team_event_type_members"("team_event_type_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_booking_assignments_booking_id_idx" ON "team_booking_assignments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "team_booking_assignments_team_event_type_id_idx" ON "team_booking_assignments" USING btree ("team_event_type_id");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_slug_unique" UNIQUE("slug");
