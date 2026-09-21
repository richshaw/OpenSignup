import { eq } from 'drizzle-orm';
import type { Queryable } from '@/db/client';
import { signups } from '@/db/schema/signups';

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
 * Lock order: signup row first, then slot rows (`lockSlotsForSignup` in
 * ./slots.ts). The single-slot services hold one slot row and never take
 * this lock afterwards.
 */
export async function lockSignupForWrite(tx: Queryable, signupId: string) {
  const [row] = await tx
    .select()
    .from(signups)
    .where(eq(signups.id, signupId))
    .for('no key update')
    .limit(1);
  return row;
}
