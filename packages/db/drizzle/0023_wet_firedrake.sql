ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_notification_rule_id_notification_rules_id_fk";
--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_rule_type_fk" FOREIGN KEY ("notification_rule_id","notification_type") REFERENCES "public"."notification_rules"("id","notification_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_id_type_unique" UNIQUE("id","notification_type");