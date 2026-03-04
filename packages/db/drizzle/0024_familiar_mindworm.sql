ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_sent_state_check";--> statement-breakpoint
ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_canceled_state_check";--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_terminal_state_consistency_check" CHECK ((
        "scheduled_notifications"."status" = 'sent'
        AND "scheduled_notifications"."sent_at" is not null
        AND "scheduled_notifications"."canceled_at" is null
      ) OR (
        "scheduled_notifications"."status" = 'canceled'
        AND "scheduled_notifications"."canceled_at" is not null
        AND "scheduled_notifications"."sent_at" is null
      ) OR (
        "scheduled_notifications"."status" in ('pending', 'failed')
        AND "scheduled_notifications"."sent_at" is null
        AND "scheduled_notifications"."canceled_at" is null
      ));