import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db, Queryable, Tx } from '@/db/client';
import type { activity } from '@/db/schema/activity';
import type { commitments } from '@/db/schema/commitments';
import type { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { serviceError, type ServiceError } from '@/lib/errors';
import { requireWorkspaceAccess, requireWorkspaceWrite, type Actor } from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';

type SignupRow = typeof signups.$inferSelect;

/**
 * `workspace_id = ?`, where null matches only rows with no workspace, such as
 * page-view activity rows. It never widens a query, and the policy guards
 * refuse a null workspace outright, so it grants nothing either.
 */
export function inWorkspace(
  column:
    | typeof signups.workspaceId
    | typeof slots.workspaceId
    | typeof participants.workspaceId
    | typeof commitments.workspaceId
    | typeof activity.workspaceId,
  workspaceId: string | null,
) {
  return workspaceId === null ? isNull(column) : eq(column, workspaceId);
}

/**
 * One signup that has not been deleted (undefined when there is no such
 * signup, or it is soft-deleted), read without a lock. A deleted signup is
 * gone: reading it is not found, and so is writing to it, whether an
 * organizer's change, someone signing up, or a participant's edit or cancel.
 * The services load a signup by id through this, or through
 * `lockSignupForWrite` below, which applies the same rule, rather than each
 * checking `deleted_at` by hand: that is how the fields route, the slot and
 * field writes and signing up all came to miss it. Code that reaches a signup
 * another way, by slug or through a join, checks `deleted_at` itself: the
 * public page (`getPublicSignup`), a participant's own commitment
 * (`getOwnCommitment`), the reminder jobs, the confirmation email and the
 * opt-out page. Two reads use a deleted row on purpose: `deleteSignup`, which
 * is idempotent, and the slug check in `pickAvailableSlug`, since the unique
 * index on slug covers deleted rows too.
 *
 * Unscoped by workspace, unlike the locks: callers use it to find which
 * workspace to judge the actor against, and pass the policy guard next.
 */
export async function readLiveSignup(db: Queryable, signupId: string) {
  const [row] = await db
    .select()
    .from(signups)
    .where(and(eq(signups.id, signupId), isNull(signups.deletedAt)))
    .limit(1);
  return row;
}

/**
 * Loads one signup for reading and judges access to it, for callers that then
 * read something hanging off the row (its slots, its fields, its activity
 * log, its CSV export). A soft-deleted signup is not found (`readLiveSignup`),
 * as it is to the organizer's list and the public page, so nothing reached
 * through this serves a deleted signup's participants.
 */
export async function getSignupRowForOrganizer(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SignupRow, ServiceError>> {
  const row = await readLiveSignup(db, signupId);
  if (!row) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceAccess(actor, row.workspaceId);
  return ok(row);
}

/**
 * Runs `work` as a write to one signup, opened the way every such write
 * opens: find the live signup (not found when there is none, or it is
 * deleted), judge the actor against its workspace, start a transaction, lock
 * the row (`lockSignupForWrite`) and read it again under the lock, which is
 * not found too when a delete committed while this waited. `work` gets the
 * transaction and the row as read under the lock, so a write cannot forget
 * the check after the lock, which is the one that kept going missing.
 */
export async function withSignupWriteLock<T>(
  db: Db,
  actor: Actor,
  signupId: string,
  work: (tx: Tx, signup: SignupRow) => Promise<Result<T, ServiceError>>,
): Promise<Result<T, ServiceError>> {
  const found = await readLiveSignup(db, signupId);
  if (!found) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceWrite(actor, found.workspaceId);

  return db.transaction(async (tx) => {
    const locked = await lockSignupForWrite(tx, signupId, found.workspaceId);
    if (!locked) return err(serviceError('not_found', 'signup not found'));
    return work(tx, locked);
  });
}

/**
 * Locks the signup row until the transaction ends and returns it, read under
 * the lock (undefined when there is no such signup, or it is soft-deleted,
 * including by a delete that committed while this waited: Postgres checks the
 * row again once the delete's lock is released). Every service that
 * rewrites a signup's settings or status, changes its fields, or adds, edits
 * or reorders its slots takes this first, so they run one at a time per signup.
 * A publish then locks the signup's slots too (`lockSlotsForSignup`), so it
 * counts them after any `deleteSlot` already holding one has finished.
 *
 * `for no key update`, not `for update`: someone signing up (`commitToSlot`)
 * holds their slot row and then inserts a commitment whose signup_id foreign
 * key key-shares this row. `for update` blocks that key-share while the holder
 * waits for the slot, and Postgres fails one of the two (40P01). None of the
 * callers changes the signup's key, so the weaker lock is enough: it still
 * conflicts with itself and lets the key-share through.
 *
 * Lock order: signup row first, then slot rows (`lockSlotsForSignup` and
 * `lockSlot` below). A single-slot edit (`updateSlot`) takes this lock before
 * its slot, so it validates, and works out slot_at, from the fields and the
 * anchor as they stand. The services that hold one slot row without it
 * (`commitToSlot`, a participant's quantity change in
 * `updateOwnCommitment`, and `deleteSlot`) never take it afterwards.
 * Commitment rows come after the slot's (see `updateOwnCommitment`); a
 * service that locks only a commitment (`cancelOwnCommitment`,
 * `removeCommitment`) takes neither lock after it.
 *
 * `tx` is a transaction, not `Queryable`: on the pool handle the lock would be
 * gone as soon as the select's own autocommit ended. `workspaceId` is the one
 * the caller passed to `requireWorkspaceWrite`, so the row is scoped to the
 * workspace the actor was cleared for, like every other tenant-table query.
 */
export async function lockSignupForWrite(tx: Tx, signupId: string, workspaceId: string | null) {
  const [row] = await tx
    .select()
    .from(signups)
    .where(
      and(
        eq(signups.id, signupId),
        inWorkspace(signups.workspaceId, workspaceId),
        isNull(signups.deletedAt),
      ),
    )
    .for('no key update')
    .limit(1);
  return row;
}

/**
 * The order a signup's slots are shown in, everywhere: the organizer view, the
 * public page and the MCP tools. `lockSlotsForSignup` locks in this order too,
 * so an insert before a given slot finds the same neighbours people see.
 */
export const SLOT_DISPLAY_ORDER = [asc(slots.sortOrder), asc(slots.slotAt), asc(slots.createdAt)];

/**
 * A signup's slots in the order they are shown, with every row locked until
 * the transaction ends. Take the signup row lock first (`lockSignupForWrite`):
 * `commitToSlot` and `deleteSlot` hold one slot row and then key-share the
 * signup, so signup before slots is the only order that cannot deadlock with
 * them. A single-slot change in flight finishes first, and the rows come back
 * as it left them. `tx` has to be a transaction, and `workspaceId` scopes the
 * rows, both as above.
 */
export async function lockSlotsForSignup(tx: Tx, signupId: string, workspaceId: string | null) {
  return tx
    .select()
    .from(slots)
    .where(and(eq(slots.signupId, signupId), inWorkspace(slots.workspaceId, workspaceId)))
    .orderBy(...SLOT_DISPLAY_ORDER)
    .for('update');
}

/**
 * One slot row, locked until the transaction ends and read under the lock
 * (undefined when there is no such slot, or it was deleted while this waited).
 * The row `commitToSlot` locks, so counting its commitments after this sees
 * every sign-up that got in first and none can start until the transaction
 * ends. A caller that takes the signup lock takes it first, as above. `tx` and
 * `workspaceId` as above.
 */
export async function lockSlot(tx: Tx, slotId: string, workspaceId: string | null) {
  const [row] = await tx
    .select()
    .from(slots)
    .where(and(eq(slots.id, slotId), inWorkspace(slots.workspaceId, workspaceId)))
    .for('update')
    .limit(1);
  return row;
}
