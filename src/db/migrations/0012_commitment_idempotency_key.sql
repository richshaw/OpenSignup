-- A sign-up sent again with the same idempotency key gets back the commitment
-- the first one made, rather than a second (#387). Nullable with no default,
-- so adding it rewrites nothing.
ALTER TABLE "commitments" ADD COLUMN "idempotency_key_hash" text;
