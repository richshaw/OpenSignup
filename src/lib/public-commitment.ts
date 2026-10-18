import type { Commitment } from '@/db/schema/commitments';

/**
 * The commitment fields a participant's own responses carry (sign up, view,
 * edit, move). A list of what may go out rather than of what may not, so a
 * column added to `commitments` stays on the server until someone adds it
 * here. The edit-token and idempotency-key hashes are left out: they are read
 * only where they are checked.
 */
export const PUBLIC_COMMITMENT_FIELDS = [
  'id',
  'slotId',
  'signupId',
  'workspaceId',
  'participantId',
  'position',
  'status',
  'quantity',
  'notes',
  'notesVisibility',
  'customFieldValues',
  'paymentId',
  'createdAt',
  'updatedAt',
  'cancelledAt',
] as const satisfies readonly (keyof Commitment)[];

export type PublicCommitment = Pick<Commitment, (typeof PUBLIC_COMMITMENT_FIELDS)[number]>;

/** A copy of `row` with only the fields in `PUBLIC_COMMITMENT_FIELDS`. */
export function toPublicCommitment(row: Commitment): PublicCommitment {
  return Object.fromEntries(
    PUBLIC_COMMITMENT_FIELDS.map((field) => [field, row[field]]),
  ) as PublicCommitment;
}
