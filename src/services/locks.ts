import { asc, eq } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';

/**
 * Locks the signup row until the transaction ends and returns it, read under
 * the lock (undefined when there is no such signup). Every service that
 * rewrites a signup's settings, or writes more than one of its slots, takes
 * this first, so they run one at a time per signup.
 *
 * `for no key update`, not `for update`: someone signing up (`commitToSlot`)
 * holds their slot row and then inserts a commitment whose signup_id foreign
 * key key-shares this row. `for update` blocks that key-share while the holder
 * waits for the slot, and Postgres fails one of the two (40P01). None of the
 * callers changes the signup's key, so the weaker lock is enough: it still
 * conflicts with itself and lets the key-share through.
 *
 * Lock order: signup row first, then slot rows (`lockSlotsForSignup` below).
 * The single-slot services hold one slot row and never take this lock
 * afterwards.
 *
 * `tx` is a transaction, not `Queryable`: on the pool handle the lock would be
 * gone as soon as the select's own autocommit ended.
 */
export async function lockSignupForWrite(tx: Tx, signupId: string) {
  const [row] = await tx
    .select()
    .from(signups)
    .where(eq(signups.id, signupId))
    .for('no key update')
    .limit(1);
  return row;
}

/**
 * A signup's slots in the order they are shown, with every row locked until
 * the transaction ends. Take the signup row lock first (`lockSignupForWrite`):
 * `commitToSlot` and `deleteSlot` hold one slot row and then key-share the
 * signup, so signup before slots is the only order that cannot deadlock with
 * them. A single-slot change in flight finishes first, and the rows come back
 * as it left them. `tx` has to be a transaction, as above.
 */
export async function lockSlotsForSignup(tx: Tx, signupId: string) {
  return tx
    .select()
    .from(slots)
    .where(eq(slots.signupId, signupId))
    .orderBy(asc(slots.sortOrder), asc(slots.slotAt), asc(slots.createdAt))
    .for('update');
}
