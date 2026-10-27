/**
 * What the worker's emails to a participant about a slot they hold (the
 * reminder and the slot-change email) share: loading the commitment the job
 * names and logging why it was skipped, the links every such email carries,
 * and the activity row that records it went out.
 */
import type { SQL } from 'drizzle-orm';
import type { Db } from '@/db/client';
import type { ActivityEvent } from '@/db/schema/activity';
import { recordActivity } from '@/lib/activity';
import { log } from '@/lib/log';
import { commitmentEditUrl, reminderUnsubscribePostUrl, reminderUnsubscribeUrl } from '@/lib/links';
import { editTokenFor } from '@/lib/token';
import { reminderOptOutTokenFor } from '@/services/reminder-optout';
import { loadCommitmentRow, slotText } from '@/email/commitment-row';
import { skipReasons } from './notify-rules';

type CommitmentRow = NonNullable<Awaited<ReturnType<typeof loadCommitmentRow>>>;

/**
 * The commitment as it is now, if it still passes `condition` (every rule in
 * `rules`), with the email and slot time the rules guarantee. Otherwise logs
 * `messages.notFound` when there is no such commitment, or
 * `messages.notDue` with the names of the rules it fails, and returns nothing.
 */
export async function loadDueRow(
  db: Db,
  commitmentId: string,
  rules: Record<string, SQL>,
  condition: SQL,
  messages: { notFound: string; notDue: string },
): Promise<{ row: CommitmentRow; to: string; slotAt: Date } | undefined> {
  const row = await loadCommitmentRow(db, commitmentId, condition);
  if (!row) {
    const reasons = await skipReasons(db, commitmentId, rules);
    if (reasons === null) {
      log.warn({ commitmentId }, messages.notFound);
    } else {
      log.info({ commitmentId, reasons }, messages.notDue);
    }
    return undefined;
  }
  // The rules require an email and a slot time, so this only narrows the types.
  const to = row.participant.email;
  const slotAt = row.slot.slotAt;
  if (to === null || slotAt === null) return undefined;
  return { row, to, slotAt };
}

/**
 * The props every worker email to a participant shares, and the one-click
 * unsubscribe target for its headers. One opt-out link serves both emails, so
 * one unsubscribe silences both.
 */
export async function workerEmailParts(db: Db, row: CommitmentRow) {
  const optOutToken = reminderOptOutTokenFor(row.participant.id);
  return {
    props: {
      participantName: row.participant.name,
      signupTitle: row.signup.title,
      // Edit tokens are HMAC(secret, commitment_id), so the job can re-derive
      // the participant's own link without storing anything recoverable.
      manageUrl: commitmentEditUrl(
        row.signup.slug,
        row.commitment.id,
        editTokenFor(row.commitment.id),
      ),
      unsubscribeUrl: reminderUnsubscribeUrl(row.signup.slug, row.participant.id, optOutToken),
      ...(await slotText(db, row.signup.id, row.slot.values)),
      notes: row.commitment.notes,
    },
    unsubscribePostUrl: reminderUnsubscribePostUrl(row.participant.id, optOutToken),
  };
}

/**
 * Records that the email went out, for the slot time it named. The row is
 * what the jobs' own checks find before sending again.
 */
export async function recordWorkerEmailSent(
  db: Db,
  row: CommitmentRow,
  eventType: Extract<ActivityEvent, 'reminder.sent' | 'slot.change_sent'>,
  slotAt: Date,
): Promise<void> {
  await recordActivity(db, {
    signupId: row.signup.id,
    workspaceId: row.signup.workspaceId,
    actor: { actorId: null, actorType: 'system' },
    eventType,
    payload: {
      commitmentId: row.commitment.id,
      participantId: row.participant.id,
      channel: 'email',
      slotAt: slotAt.toISOString(),
    },
  });
}
