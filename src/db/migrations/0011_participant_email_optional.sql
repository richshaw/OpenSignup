-- Groundwork for signups that make the email optional (#378). A participant
-- without one has both columns null; the check keeps them paired, and an
-- email that is there not blank. The unique index on (signup_id, email_lower)
-- stays as it is: Postgres treats NULLs as distinct there, so any number of
-- such participants can share a signup.
--
-- The check is added NOT VALID and then validated, so that run on their own
-- these statements scan the existing rows under a lock that lets reads and
-- writes through. drizzle's migrator runs a deploy's migrations in one
-- transaction, which keeps the ADD's stronger lock until it commits.
ALTER TABLE "participants" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ALTER COLUMN "email_lower" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_email_lower_with_email" CHECK (("participants"."email" IS NULL AND "participants"."email_lower" IS NULL) OR ("participants"."email" IS NOT NULL AND "participants"."email_lower" IS NOT NULL AND "participants"."email" <> '' AND "participants"."email_lower" <> '')) NOT VALID;--> statement-breakpoint
ALTER TABLE "participants" VALIDATE CONSTRAINT "participants_email_lower_with_email";