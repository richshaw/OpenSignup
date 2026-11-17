import type { commitments as commitmentsTable } from '@/db/schema/commitments';
import type { Translator } from '@/i18n/translator';
import type { SignupStatus } from '@/schemas/signups';
import { ACTIVE_COMMITMENT_STATUSES, shownCommitmentStatus } from '@/services/commitments';

type Status = (typeof commitmentsTable.$inferSelect)['status'];

/**
 * The line above the Responses table: "5 sign-ups · 1 cancelled · 1 removed",
 * in the translator's language. `count` is the tab's badge, the active
 * sign-ups; `rest` is what dropped out, as the table's status pills name it.
 * The old half of a move isn't counted, since the new one already is, and a
 * part that would read 0 is left out.
 */
export function summarizeResponses(
  commitments: readonly { id: string; status: Status }[],
  ended: ReadonlyMap<string, 'removed' | 'moved'>,
  t: Translator<'organizer.responses'>,
): { count: string; rest: string[] } {
  let active = 0;
  let cancelled = 0;
  let removed = 0;
  for (const c of commitments) {
    if (ACTIVE_COMMITMENT_STATUSES.includes(c.status)) {
      active++;
      continue;
    }
    // A `moved` one falls through uncounted: its new half is active above.
    const shown = shownCommitmentStatus(c, ended);
    if (shown === 'cancelled') cancelled++;
    else if (shown === 'removed') removed++;
  }
  const rest: string[] = [];
  if (cancelled > 0) rest.push(t('summary.cancelled', { count: cancelled }));
  if (removed > 0) rest.push(t('summary.removed', { count: removed }));
  return { count: t('summary.signUps', { count: active }), rest };
}

/** Each status's message, by a literal key, so the catalog check sees each one in use. */
const EMPTY_KEY = {
  draft: 'empty.draft',
  open: 'empty.open',
  closed: 'empty.closed',
  archived: 'empty.archived',
} as const satisfies Record<SignupStatus, string>;

/**
 * What the Responses tab says when nobody has signed up. A draft has no
 * public link on screen to share, and a closed or archived signup takes no
 * more sign-ups, so only an open one is pointed at the link. A closed one
 * says only that nobody did: "closed" already means nobody can sign up, and
 * its header says it's closed ("Closed · 0 of 6 spots taken"). "Archived"
 * doesn't mean that, so an archived one says why. In the translator's
 * language, a message per status.
 * "Signup" is the page, never what someone did (docs/writing-help.md).
 */
export function noResponsesLine(
  status: SignupStatus,
  t: Translator<'organizer.responses'>,
): string {
  return t(EMPTY_KEY[status]);
}
