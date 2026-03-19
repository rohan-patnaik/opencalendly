WITH ranked_writeback_connections AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_number
  FROM "calendar_connections"
  WHERE "use_for_writeback" = true
)
UPDATE "calendar_connections"
SET "use_for_writeback" = false
WHERE "id" IN (
  SELECT id
  FROM ranked_writeback_connections
  WHERE row_number > 1
);

CREATE UNIQUE INDEX "calendar_connections_user_single_writeback_uidx" ON "calendar_connections" USING btree ("user_id") WHERE "calendar_connections"."use_for_writeback" = true;
