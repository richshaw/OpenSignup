-- Schema for a signup-claiming feature that was never built. Nothing reads or
-- writes any of it: the table is empty everywhere, the signups column is null
-- in every row, and login codes always wrote scope_id as null. IF EXISTS so an
-- instance whose schema was synced with `pnpm db:push` still migrates; no
-- CASCADE, so anything an operator built on the table stops the drop instead
-- of going with it.
DROP TABLE IF EXISTS "signup_claims";--> statement-breakpoint
ALTER TABLE "signups" DROP COLUMN IF EXISTS "claim_token_hash";--> statement-breakpoint
ALTER TABLE "magic_links" DROP COLUMN IF EXISTS "scope_id";
