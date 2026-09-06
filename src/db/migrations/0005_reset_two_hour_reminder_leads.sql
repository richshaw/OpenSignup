-- Move every signup off the 2-hour reminder lead, which the settings UI no
-- longer offers (REMINDER_LEAD_HOUR_CHOICES in src/schemas/signups.ts).
--
-- It is not simply unoffered but harmless: extractSlotAt pins the organizer's
-- wall clock to UTC, so a reminder fires wrong by the organizer's UTC offset.
-- At the 24h default that is a rounding error; at 2h the offset exceeds the
-- lead itself. Left alone these rows would keep the broken timing indefinitely,
-- because leadHourOptions deliberately preserves a saved-but-unoffered value.
--
-- Compared as jsonb rather than cast to int on purpose: settings is written by
-- several paths and a ::int cast throws on any row holding a non-numeric value.
UPDATE "signups"
SET "settings" = jsonb_set("settings", '{reminderLeadHours}', '24'::jsonb)
WHERE "settings"->'reminderLeadHours' = '2'::jsonb;
