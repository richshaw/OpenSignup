-- Reminders now go out a fixed 24 hours before a slot, and the date field that
-- gives a slot its instant (slots.slot_at) is always named explicitly in
-- settings.reminderFromFieldRef. Bring stored rows in line with both rules.
--
-- 1. Drop reminderLeadHours. The lead is no longer configurable, and a stored
--    value would otherwise survive as a key nothing reads.
UPDATE "signups"
SET "settings" = "settings" - 'reminderLeadHours'
WHERE "settings" ? 'reminderLeadHours';
--> statement-breakpoint
-- 2. Find every signup whose reminderFromFieldRef does not name one of its
--    date fields (absent, or dangling after a delete / retype) and decide what
--    it should be: the first date field by (sort_order, ref), or
--    nothing when the signup has no date field. Refs that already name a date
--    field are left exactly as they are — an organizer's choice is not
--    second-guessed.
CREATE TEMP TABLE "reminder_repin" ON COMMIT DROP AS
SELECT s."id" AS "signup_id", fd."ref" AS "new_ref"
FROM "signups" s
LEFT JOIN LATERAL (
  SELECT f."ref"
  FROM "slot_fields" f
  WHERE f."signup_id" = s."id" AND f."field_type" = 'date'
  ORDER BY f."sort_order", f."ref" COLLATE "C"
  LIMIT 1
) fd ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "slot_fields" f
  WHERE f."signup_id" = s."id"
    AND f."field_type" = 'date'
    AND f."ref" = s."settings"->>'reminderFromFieldRef'
)
AND (fd."ref" IS NOT NULL OR s."settings" ? 'reminderFromFieldRef');
--> statement-breakpoint
UPDATE "signups" s
SET "settings" = CASE
  WHEN r."new_ref" IS NULL THEN s."settings" - 'reminderFromFieldRef'
  ELSE s."settings" || jsonb_build_object('reminderFromFieldRef', r."new_ref")
END
FROM "reminder_repin" r
WHERE r."signup_id" = s."id";
--> statement-breakpoint
-- A date parser that answers NULL instead of raising. `::date` rejects
-- 2026-02-30 and 2026-13-45 with an error, and one bad legacy value must not
-- abort the whole migration. Temporary, so it vanishes with the session.
CREATE FUNCTION pg_temp.reminder_real_date(value text) RETURNS date
LANGUAGE plpgsql AS $$
BEGIN
  RETURN value::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- 3. Recompute slot_at for the slots of every signup re-pinned above, with the
--    same rule as extractSlotAt in src/services/slot-fields.ts: the anchor
--    date's value plus the paired time field's value (the first time field
--    sorting after the date, else the first time field), pinned to UTC; NULL
--    when the date value is missing or is not a real calendar date. Before this
--    migration these rows were either NULL (two date fields and no ref chosen)
--    or stranded on a field that no longer exists.
WITH "anchor" AS (
  SELECT
    r."signup_id",
    d."ref" AS "date_ref",
    (
      SELECT t."ref"
      FROM "slot_fields" t
      WHERE t."signup_id" = r."signup_id" AND t."field_type" = 'time'
      ORDER BY
        ((t."sort_order", t."ref" COLLATE "C") > (d."sort_order", d."ref" COLLATE "C")) DESC,
        t."sort_order",
        t."ref" COLLATE "C"
      LIMIT 1
    ) AS "time_ref"
  FROM "reminder_repin" r
  LEFT JOIN "slot_fields" d ON d."signup_id" = r."signup_id" AND d."ref" = r."new_ref"
)
UPDATE "slots" sl
SET "slot_at" = CASE
  WHEN a."date_ref" IS NULL THEN NULL
  -- Same shape extractSlotAt demands, then a day that exists.
  WHEN (sl."values"->>a."date_ref") !~ '^[1-9]\d{3}-\d{2}-\d{2}$' THEN NULL
  WHEN pg_temp.reminder_real_date(sl."values"->>a."date_ref") IS NULL THEN NULL
  ELSE (
    (sl."values"->>a."date_ref") || 'T' ||
    CASE
      WHEN a."time_ref" IS NOT NULL
       AND (sl."values"->>a."time_ref") ~ '^([01]\d|2[0-3]):[0-5]\d$'
      THEN (sl."values"->>a."time_ref")
      ELSE '00:00'
    END || ':00Z'
  )::timestamptz
END
FROM "anchor" a
WHERE sl."signup_id" = a."signup_id";
