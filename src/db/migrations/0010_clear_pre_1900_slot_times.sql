-- A date field no longer takes a year before 1900 (#324), and extractSlotAt
-- (src/services/slot-fields.ts) gives a slot whose anchor date is earlier no
-- instant. Bring stored rows in line now rather than at each signup's next
-- rebuild: until then the sign-up lockout check and "Add to calendar" kept
-- reading the old instant, and the driver reads a year below 100 back a
-- century late, so a slot dated 0099 looked like 1999 to both. Only slot_at is
-- cleared; the date the organizer entered stays in the slot's values.
--
-- The cutoff is spelled out in UTC because a bare '1900-01-01' is read in the
-- session's time zone. extractSlotAt pins every instant to UTC, so the
-- earliest it can give is 1900-01-01 00:00 UTC.
UPDATE "slots"
SET "slot_at" = NULL
WHERE "slot_at" < '1900-01-01 00:00:00+00';
