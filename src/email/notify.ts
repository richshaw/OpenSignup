/**
 * Post-mutation email side effects.
 *
 * Kept out of `src/services/*` because services are pure(-ish) `(db, actor,
 * input) => Result` functions that run inside DB tests, and out of route
 * handlers because those stay thin. Call these from `after()` so a slow or
 * failing mail server never delays or fails the participant's request.
 *
 * Every function here swallows its own errors: a confirmation email is a
 * courtesy, and losing one must never look like a failed sign-up.
 */
import type { Db } from '@/db/client';
import { recordActivity } from '@/lib/activity';
import { ServiceException } from '@/lib/errors';
import { commitmentEditUrl } from '@/lib/links';
import { log } from '@/lib/log';
import { consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { willSendReminder } from '@/lib/reminder-eligibility';
import { sendsReminders } from '@/schemas/signups';
import { alreadyRecorded, loadCommitmentRow, slotText } from './commitment-row';
import { sendCommitmentConfirmation } from './send';

/**
 * Emails a participant the receipt for a commitment they just made, including
 * the token-bearing link they need to change or cancel it later.
 *
 * Unlike reminders this is transactional — it acknowledges an action the
 * participant took seconds ago — so it is not gated on the signup's reminder
 * settings.
 *
 * `meterRecipient` charges the recipient's address against the same
 * per-address limit signing up uses. Signing up charges it before the commit,
 * from the address in the request; a move has no address in its request, so
 * the move route asks for it here, where the address is known. Over the limit,
 * the email is skipped and the move stands. If the limit can't be checked at
 * all, the email is skipped too, like any other failure here.
 */
export async function notifyCommitmentCreated(
  db: Db,
  commitmentId: string,
  editToken: string,
  opts: { meterRecipient?: boolean } = {},
): Promise<void> {
  try {
    const row = await loadCommitmentRow(db, commitmentId);

    if (!row) {
      log.warn({ commitmentId }, 'commitment not found for confirmation email');
      return;
    }
    // Deleted since the sign-up: this runs after the response, and
    // `commitToSlot` reads the signup without locking it, so a delete can land
    // before either. The signup is gone, and so is the edit link the email
    // would carry. A delete landing after this read is not caught.
    if (row.signup.deletedAt) {
      log.info({ commitmentId }, 'signup deleted; no confirmation email');
      return;
    }
    // Signed up without an email: there is nowhere to send one. The response
    // that made the commitment, a sign-up or a move, carries its edit link
    // and puts it in the returning-participant cookie.
    const to = row.participant.email;
    if (to === null) {
      log.info({ commitmentId }, 'participant has no email; no confirmation email');
      return;
    }

    // Belt and braces, not the primary defence. This is a read-then-write with
    // no lock, so it would not survive two concurrent calls for the same
    // commitment — but there is no path that produces them. This runs once per
    // successful POST (from `after()`), each successful POST inserts exactly
    // one commitment with a fresh UUIDv7 id, a racing duplicate commit by
    // the same participant is rejected as `conflict` under the slot's
    // SELECT ... FOR UPDATE (src/services/commitments.ts), and a retry with
    // the same idempotency key gets the first commitment back and is not
    // sent from (`repeated`, in the POST route). The check earns its
    // place only against a future caller that retries; if one is ever added,
    // the claim has to move before the send, not after it — an atomic guard
    // here would still leave the email already sent.
    if (await alreadyRecorded(db, 'commitment.confirmation_sent', row.signup.id, commitmentId)) {
      return;
    }

    if (opts.meterRecipient) {
      try {
        await consumeRateLimit(db, RateLimits.commitmentPerEmail, to.trim().toLowerCase());
      } catch (err) {
        if (err instanceof ServiceException && err.serviceError.code === 'rate_limited') {
          log.info({ commitmentId }, 'recipient over the per-address limit; no confirmation email');
          return;
        }
        throw err;
      }
    }

    // Only promise a reminder the dispatcher would actually send. The gate is
    // the dispatcher's own rule (src/lib/reminder-eligibility.ts), not a
    // paraphrase of it: reminders on and a slot date are not enough, because a
    // slot less than an hour out is one the created_at guard can never reach.
    const promisesReminder = willSendReminder({
      sendReminders: sendsReminders(row.signup.settings),
      slotAt: row.slot.slotAt,
      createdAt: row.commitment.createdAt,
    });

    await sendCommitmentConfirmation(to, {
      participantName: row.participant.name,
      signupTitle: row.signup.title,
      manageUrl: commitmentEditUrl(row.signup.slug, row.commitment.id, editToken),
      ...(await slotText(db, row.signup.id, row.slot.values)),
      notes: row.commitment.notes,
      quantity: row.commitment.quantity,
      promisesReminder,
    });

    await recordActivity(db, {
      signupId: row.signup.id,
      workspaceId: row.signup.workspaceId,
      actor: { actorId: row.participant.id, actorType: 'participant' },
      eventType: 'commitment.confirmation_sent',
      payload: {
        commitmentId: row.commitment.id,
        participantId: row.participant.id,
        channel: 'email',
      },
    });
  } catch (err) {
    // A missed confirmation is a courtesy lost, not a failed sign-up. The
    // commitment is already committed; the participant has their link on
    // screen and in the returning-participant cookie.
    log.error({ err, commitmentId }, 'confirmation email failed');
  }
}
