-- Dashboard data rules: the facility closes at 20:00 and each user may have
-- at most one active/completed reservation in an ISO week.
--
-- Reservations/shifts starting at or after 20:00 are deleted outright (the
-- facility is closed, they should never have existed); reservations/shifts
-- that start before 20:00 but run past it are capped to end exactly at
-- 20:00 instead. Dependent rows (reviews on a deleted reservation,
-- therapist_breaks on a deleted shift) must be removed first — both FKs use
-- Postgres's default ON DELETE NO ACTION, so deleting the parent first would
-- fail on any database where those dependent rows exist.
--> statement-breakpoint
DELETE FROM reviews
WHERE reservation_id IN (
  SELECT id FROM reservations WHERE start_time >= TIME '20:00'
);
--> statement-breakpoint
DELETE FROM reservations
WHERE start_time >= TIME '20:00';
--> statement-breakpoint
UPDATE reservations
SET end_time = TIME '20:00', updated_at = now()
WHERE start_time < TIME '20:00' AND end_time > TIME '20:00';
--> statement-breakpoint
DELETE FROM therapist_breaks
WHERE shift_id IN (
  SELECT id FROM therapist_shifts WHERE start_time >= TIME '20:00'
);
--> statement-breakpoint
DELETE FROM therapist_shifts
WHERE start_time >= TIME '20:00';
--> statement-breakpoint
UPDATE therapist_shifts
SET end_time = TIME '20:00', updated_at = now()
WHERE start_time < TIME '20:00' AND end_time > TIME '20:00';
--> statement-breakpoint
WITH duplicate_reservations AS (
  SELECT id
  FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, date_trunc('week', reservation_date::timestamp)
             ORDER BY created_at ASC, id ASC
           ) AS row_number
    FROM reservations
    WHERE status IN ('confirmed', 'completed')
  ) ranked
  WHERE row_number > 1
)
DELETE FROM reviews
WHERE reservation_id IN (SELECT id FROM duplicate_reservations);
--> statement-breakpoint
WITH duplicate_reservations AS (
  SELECT id
  FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, date_trunc('week', reservation_date::timestamp)
             ORDER BY created_at ASC, id ASC
           ) AS row_number
    FROM reservations
    WHERE status IN ('confirmed', 'completed')
  ) ranked
  WHERE row_number > 1
)
DELETE FROM reservations
WHERE id IN (SELECT id FROM duplicate_reservations);
