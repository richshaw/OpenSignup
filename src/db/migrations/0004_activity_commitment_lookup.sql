-- Hot paths look up activity rows by the commitmentId inside `payload`: the
-- reminder dispatcher's NOT EXISTS and the send-time guard. Without an
-- expression index Postgres scans every row of the matching event_type to prove
-- a miss, so the cost grows with the lifetime volume of sent email. The
-- dispatcher now scans the whole reminder lead window rather than a two-hour
-- slice, which makes that scan both wider and unavoidable.
--
-- Partial, because these are the only event types ever queried this way.
-- 'commitment.confirmation_sent' is listed ahead of the confirmation email that
-- emits it: predicating on a value no row carries yet costs nothing, and saves
-- rebuilding the index when it lands.
CREATE INDEX IF NOT EXISTS "activity_commitment_lookup"
  ON "activity" (("payload"->>'commitmentId'))
  WHERE "event_type" IN ('reminder.sent', 'commitment.confirmation_sent');
