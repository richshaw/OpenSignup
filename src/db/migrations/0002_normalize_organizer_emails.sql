-- Normalize any existing organizer emails to lowercase so that the case-sensitive
-- equality lookup in getUserByEmail continues to work after EmailSchema started
-- producing lowercase-only values.
UPDATE "organizers" SET "email" = lower("email") WHERE "email" != lower("email");
