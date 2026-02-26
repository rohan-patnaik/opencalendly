ALTER TABLE "email_deliveries" RENAME COLUMN "recipient_email" TO "recipient_email_hash";
ALTER TABLE "email_deliveries" ALTER COLUMN "recipient_email_hash" TYPE varchar(64);
