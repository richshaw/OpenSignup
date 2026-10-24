import type { commitments as commitmentsTable } from '@/db/schema/commitments';
import type { SignupStatus } from '@/schemas/signups';
import { ACTIVE_COMMITMENT_STATUSES } from '@/services/commitments';

type Status = (typeof commitmentsTable.$inferSelect)['status'];

/**
 * The line above the Responses table: "5 sign-ups · 1 cancelled · 1 removed".
 * `count` is the tab's badge, the active sign-ups; `rest` is what dropped out,
 * by the same words as the table's status pills. The old half of a move isn't
 * counted, since the new one already is, and a part that would read 0 is left
 * out.
 */
export function summarizeResponses(
  commitments: readonly { id: string; status: Status }[],
  ended: ReadonlyMap<string, 'removed' | 'moved'>,
): { count: string; rest: string[] } {
  let active = 0;
  let cancelled = 0;
  let removed = 0;
  for (const c of commitments) {
    if (ACTIVE_COMMITMENT_STATUSES.includes(c.status)) active++;
    else if (c.status === 'cancelled') {
      const how = ended.get(c.id);
      if (how === 'removed') removed++;
      else if (how === undefined) cancelled++;
    }
  }
  const rest: string[] = [];
  if (cancelled > 0) rest.push(`${cancelled} cancelled`);
  if (removed > 0) rest.push(`${removed} removed`);
  return { count: `${active} ${active === 1 ? 'sign-up' : 'sign-ups'}`, rest };
}

/**
 * What the Responses tab says when nobody has signed up. A draft has no
 * public link on screen to share, and a closed or archived signup takes no
 * more sign-ups, so only an open one is pointed at the link. A closed one's
 * banner already says why nobody can sign up; an archived one has no banner.
 * "Signup" is the page, never what someone did (docs/writing-help.md).
 */
export function noResponsesLine(status: SignupStatus): string {
  if (status === 'draft')
    return 'Nobody has signed up yet. People can sign up once you publish and share it.';
  if (status === 'open')
    return 'Nobody has signed up yet. Share the public link to start collecting.';
  if (status === 'closed') return 'Nobody signed up.';
  return 'Nobody signed up. People can’t sign up now.';
}
