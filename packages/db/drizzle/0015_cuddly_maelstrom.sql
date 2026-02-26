ALTER TABLE "email_deliveries" RENAME COLUMN "recipient_email" TO "recipient_email_hash";
ALTER TABLE "email_deliveries"
  ALTER COLUMN "recipient_email_hash" TYPE varchar(64)
  USING CASE
    WHEN "recipient_email_hash" ~ '^[A-Fa-f0-9]{64}$' THEN lower("recipient_email_hash")
    ELSE encode(digest(lower(trim("recipient_email_hash")), 'sha256'), 'hex')
  END;
ALTER TABLE "email_deliveries"
  ADD CONSTRAINT "email_deliveries_recipient_email_hash_format_check"
  CHECK ("recipient_email_hash" ~ '^[a-f0-9]{64}$');
