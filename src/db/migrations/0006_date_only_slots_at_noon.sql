-- A date-only slot now anchors at noon UTC instead of midnight. Reminders go
-- out a fixed 24 hours before slot_at and a signup carries no timezone, so a
-- midnight-UTC anchor sent the reminder at 5pm two days before for a Pacific
-- organizer; noon UTC the day before is still the day before everywhere from
-- UTC-11 to UTC+11. Recompute slot_at for every slot of every anchored signup
-- with the rule extractSlotAt (src/services/slot-fields.ts) now applies: the
-- anchor date's value plus the paired time field's value (the first time
-- field sorting after the date, else the first time field), '12:00' when the
-- slot has no time, pinned to UTC; NULL when the date value is missing or is
-- not a real calendar date. Slots with a time resolve to what they already
-- hold and are left untouched.
--
-- A date parser that answers NULL instead of raising, as in migration 0005.
-- OR REPLACE because drizzle applies every pending migration in one session,
-- so on a fresh database 0005's copy still exists when this one runs.
CREATE OR REPLACE FUNCTION pg_temp.reminder_real_date(value text) RETURNS date
LANGUAGE plpgsql AS $$
BEGIN
  RETURN value::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
--> statement-breakpoint
WITH "anchor" AS (
  SELECT
    s."id" AS "signup_id",
    d."ref" AS "date_ref",
    (
      SELECT t."ref"
      FROM "slot_fields" t
      WHERE t."signup_id" = s."id" AND t."field_type" = 'time'
      ORDER BY
        ((t."sort_order", t."ref" COLLATE "C") > (d."sort_order", d."ref" COLLATE "C")) DESC,
        t."sort_order",
        t."ref" COLLATE "C"
      LIMIT 1
    ) AS "time_ref"
  FROM "signups" s
  -- Inner join: only signups whose ref names a real date field are touched.
  -- Migration 0005 leaves every ref valid or absent, but if one were dangling
  -- this must not null out the signup's slots; the field services repair
  -- such a ref on the next change instead.
  JOIN "slot_fields" d
    ON d."signup_id" = s."id"
   AND d."field_type" = 'date'
   AND d."ref" = s."settings"->>'reminderFromFieldRef'
),
"next" AS (
  SELECT
    sl."id",
    CASE
      -- Same shape extractSlotAt demands, then a day that exists.
      WHEN (sl."values"->>a."date_ref") !~ '^[1-9]\d{3}-\d{2}-\d{2}$' THEN NULL
      WHEN pg_temp.reminder_real_date(sl."values"->>a."date_ref") IS NULL THEN NULL
      ELSE (
        (sl."values"->>a."date_ref") || 'T' ||
        CASE
          WHEN a."time_ref" IS NOT NULL
           AND (sl."values"->>a."time_ref") ~ '^([01]\d|2[0-3]):[0-5]\d$'
          THEN (sl."values"->>a."time_ref")
          ELSE '12:00'
        END || ':00Z'
      )::timestamptz
    END AS "slot_at"
  FROM "slots" sl
  JOIN "anchor" a ON a."signup_id" = sl."signup_id"
)
UPDATE "slots" sl
SET "slot_at" = n."slot_at"
FROM "next" n
WHERE n."id" = sl."id"
  AND sl."slot_at" IS DISTINCT FROM n."slot_at";
