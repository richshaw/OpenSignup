-- For a signup-claiming feature that was never built: nothing has ever read
-- or written this table, so it is empty everywhere. IF EXISTS so an instance
-- synced with `pnpm db:push` still migrates; no CASCADE, so anything an
-- operator built on the table stops the drop instead of going with it.
DROP TABLE IF EXISTS "signup_claims";
