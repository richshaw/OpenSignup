-- Three hot paths look up activity rows by the commitmentId inside `payload`:
-- the confirmation idempotency guard (runs on every commit), the reminder
-- send-time guard, and the reminder dispatcher's NOT EXISTS. Without an
-- expression index Postgres scans every row of the matching event_type to
-- prove a miss, so the cost grows with the lifetime volume of sent email.
--
-- Partial, because these are the only event types ever queried this way.
CREATE INDEX IF NOT EXISTS "activity_commitment_lookup"
  ON "activity" (("payload"->>'commitmentId'))
  WHERE "event_type" IN ('reminder.sent', 'commitment.confirmation_sent');
