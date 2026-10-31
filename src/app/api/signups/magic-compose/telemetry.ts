import type { Db } from '@/db/client';
import { activityActor, recordActivityBestEffort } from '@/lib/activity';
import type { Actor } from '@/lib/policy';
import type { FollowUp, MagicComposeQuestions } from '@/lib/magic-compose/questions';

/** How a follow-up request went, beyond what the answers themselves say. */
export interface FollowUpOutcome {
  /** The first reply asked questions again, and the route made its one retry. */
  retried: boolean;
  /** The retry asked too, or there was no time for one: the organizer got asked_again. */
  gaveUp: boolean;
}

type AnswerTopic = 'what' | 'when';

/**
 * What `magic_compose.answered` keeps of a follow-up: which of "what" and
 * "when" were answered or skipped, and how many things were picked, added or
 * given a count. Codes and counts only, never the items, the date or any
 * text, so the log holds nothing the organizer typed.
 */
export function answeredPayload(followUp: FollowUp, outcome: FollowUpOutcome) {
  const answered: AnswerTopic[] = [];
  const skipped: AnswerTopic[] = [];
  const { picked, added } = followUp.what;
  (picked.length + added.length > 0 ? answered : skipped).push('what');
  if (followUp.when) (followUp.when.kind === 'not_decided' ? skipped : answered).push('when');
  return {
    answered,
    skipped,
    picked: picked.length,
    added: added.length,
    limits: followUp.howMany?.filter((count) => count !== null).length ?? 0,
    retried: outcome.retried,
    gaveUp: outcome.gaveUp,
  };
}

/**
 * Telemetry for a first call the model answered with questions, so "asked,
 * then left at the questions screen" can be counted (an `asked` with no
 * `answered` after it). The topics and how many options, never the options.
 * Best effort, outside any transaction, as it describes no change.
 */
export async function recordAsked(
  db: Db,
  actor: Actor,
  workspaceId: string,
  questions: MagicComposeQuestions,
): Promise<void> {
  await recordActivityBestEffort(db, {
    workspaceId,
    actor: activityActor(actor),
    eventType: 'magic_compose.asked',
    payload: { topics: questions.topics, options: questions.whatOptions.length },
  });
}

/**
 * Telemetry for a follow-up request once it has ended, however it ended: one
 * row per request the quota was charged for. See `answeredPayload`.
 */
export async function recordAnswered(
  db: Db,
  actor: Actor,
  workspaceId: string,
  followUp: FollowUp,
  outcome: FollowUpOutcome,
): Promise<void> {
  await recordActivityBestEffort(db, {
    workspaceId,
    actor: activityActor(actor),
    eventType: 'magic_compose.answered',
    payload: answeredPayload(followUp, outcome),
  });
}
