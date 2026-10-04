-- Groundwork for signups that make the email optional (#378). A participant
-- without one has both columns null; the check keeps them paired. The unique
-- index on (signup_id, email_lower) stays as it is: Postgres treats NULLs as
-- distinct there, so any number of such participants can share a signup.
ALTER TABLE "participants" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ALTER COLUMN "email_lower" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_email_lower_with_email" CHECK (("participants"."email" IS NULL) = ("participants"."email_lower" IS NULL));