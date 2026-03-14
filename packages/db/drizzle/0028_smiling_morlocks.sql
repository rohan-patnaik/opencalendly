ALTER TABLE "webhook_subscriptions" ALTER COLUMN "secret" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD COLUMN "secret_encrypted" text;