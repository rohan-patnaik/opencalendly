ALTER TABLE "idempotency_requests" ADD CONSTRAINT "idempotency_requests_status_state_check" CHECK ((
        "idempotency_requests"."status" = 'in_progress'
        AND "idempotency_requests"."completed_at" IS NULL
        AND "idempotency_requests"."response_status_code" IS NULL
      ) OR (
        "idempotency_requests"."status" = 'completed'
        AND "idempotency_requests"."completed_at" IS NOT NULL
        AND "idempotency_requests"."response_status_code" IS NOT NULL
      ));