import { and, asc, eq, ne, or, sql } from 'drizzle-orm';
import type { Db, Queryable } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { participants } from '@/db/schema/participants';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { serviceError, type ServiceError } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import { parseInputSafe } from '@/lib/parse';
import { err, ok, type Result } from '@/lib/result';
import { editTokenFor, hashToken, verifyHash } from '@/lib/token';
import {
  type CommitmentCreateInput,
  type CommitmentUpdateInput,
  CommitmentCreateInputSchema,
  CommitmentUpdateInputSchema,
} from '@/schemas/commitments';

type CommitmentRow = typeof commitments.$inferSelect;

export interface CommitResult {
  commitment: CommitmentRow;
  editToken: string;
}

export async function commitToSlot(
  db: Queryable,
  slotId: string,
  rawInput: unknown,
): Promise<Result<CommitResult, ServiceError>> {
  const input = parseInputSafe(CommitmentCreateInputSchema, rawInput);
  if (!input.ok) return input;
  const data: CommitmentCreateInput = input.value;

  return db.transaction(async (tx) => {
    const slotRows = await tx
      .select()
      .from(slots)
      .where(eq(slots.id, slotId))
      .for('update')
      .limit(1);
    const slot = slotRows[0];
    if (!slot) return err(serviceError('not_found', 'slot not found'));
    if (slot.status !== 'open') {
      return err(serviceError('closed', 'that slot is closed'));
    }

    const signupRows = await tx
      .select()
      .from(signups)
      .where(eq(signups.id, slot.signupId))
      .limit(1);
    const signupRow = signupRows[0];
    if (!signupRow) return err(serviceError('not_found', 'signup missing'));
    if (signupRow.status !== 'open') {
      return err(
        serviceError('closed', 'signup is not accepting commitments', {
          field: 'status',
          received: signupRow.status,
          expected: 'open',
        }),
      );
    }
    if (signupRow.closesAt && signupRow.closesAt.getTime() < Date.now()) {
      return err(serviceError('closed', 'signup has closed'));
    }

    // Lockout before slot if configured
    const settings = (signupRow.settings ?? {}) as { lockoutHoursBeforeSlot?: number };
    if (slot.slotAt && settings.lockoutHoursBeforeSlot && settings.lockoutHoursBeforeSlot > 0) {
      const lockoutMs = settings.lockoutHoursBeforeSlot * 3600 * 1000;
      if (Date.now() > slot.slotAt.getTime() - lockoutMs) {
        return err(serviceError('closed', 'too close to the slot time to sign up'));
      }
    }

    // Upsert participant by normalized email
    const emailLower = data.email.toLowerCase().trim();
    const existingPart = await tx
      .select()
      .from(participants)
      .where(and(eq(participants.signupId, slot.signupId), eq(participants.emailLower, emailLower)))
      .limit(1);

    let participantId: string;
    if (existingPart[0]) {
      participantId = existingPart[0].id;
      await tx
        .update(participants)
        .set({ name: data.name, lastSeenAt: new Date() })
        .where(eq(participants.id, participantId));
    } else {
      participantId = makeId('par');
      await tx.insert(participants).values({
        id: participantId,
        signupId: slot.signupId,
        workspaceId: slot.workspaceId,
        email: data.email,
        emailLower,
        name: data.name,
      });
      await recordActivity(tx, {
        signupId: slot.signupId,
        workspaceId: slot.workspaceId,
        actor: { actorId: participantId, actorType: 'participant' },
        eventType: 'participant.created',
        payload: { participantId },
      });
    }

    // Conflict: same participant already holds an active commitment on this slot.
    const own = await tx
      .select()
      .from(commitments)
      .where(
        and(
          eq(commitments.slotId, slotId),
          eq(commitments.participantId, participantId),
          or(eq(commitments.status, 'confirmed'), eq(commitments.status, 'tentative')),
        ),
      )
      .limit(1);
    if (own[0]) {
      return err(
        serviceError('conflict', 'you already committed to this slot', {
          details: { commitmentId: own[0].id },
          suggestion: 'edit or cancel your existing commitment',
        }),
      );
    }

    // Capacity is the cap on sum(quantity), not row count: a Qty=5 commit on a
    // cap=4 slot is over capacity even with zero existing rows.
    const sumRows = await tx
      .select({ sum: sql<number>`coalesce(sum(${commitments.quantity}), 0)::int` })
      .from(commitments)
      .where(
        and(
          eq(commitments.slotId, slotId),
          or(eq(commitments.status, 'confirmed'), eq(commitments.status, 'tentative')),
        ),
      );
    const usedQty = sumRows[0]?.sum ?? 0;

    if (slot.capacity !== null && usedQty + data.quantity > slot.capacity) {
      const remaining = Math.max(0, slot.capacity - usedQty);
      const alts = await tx
        .select({ id: slots.id, ref: slots.ref, slotAt: slots.slotAt })
        .from(slots)
        .where(and(eq(slots.signupId, slot.signupId), eq(slots.status, 'open'), ne(slots.id, slotId)))
        .orderBy(asc(slots.slotAt), asc(slots.sortOrder))
        .limit(3);
      return err(
        serviceError(
          'capacity_full',
          remaining === 0
            ? 'that slot just filled'
            : `only ${remaining} left — you asked for ${data.quantity}`,
          {
            details: {
              remaining,
              requested: data.quantity,
              capacity: slot.capacity,
              alternatives: alts.map((a) => ({
                id: a.id,
                ref: a.ref,
                slotAt: a.slotAt?.toISOString() ?? null,
              })),
            },
            suggestion:
              remaining === 0
                ? 'pick one of the suggested open slots'
                : `lower the quantity to ${remaining} or fewer`,
          },
        ),
      );
    }

    // Position = max(position) + 1 (never reused; cancelled rows keep their position).
    const nextRows = await tx
      .select({ next: sql<number>`coalesce(max(${commitments.position}), 0) + 1` })
      .from(commitments)
      .where(eq(commitments.slotId, slotId));
    const next = nextRows[0]?.next ?? 1;

    const commitmentId = makeId('com');
    const editToken = editTokenFor(commitmentId);
    const [row] = await tx
      .insert(commitments)
      .values({
        id: commitmentId,
        slotId,
        signupId: slot.signupId,
        workspaceId: slot.workspaceId,
        participantId,
        position: next,
        status: 'confirmed',
        quantity: data.quantity,
        notes: data.notes ?? '',
        notesVisibility: 'public',
        editTokenHash: hashToken(editToken),
      })
      .returning();
    if (!row) return err(serviceError('internal', 'commit insert failed'));

    await recordActivity(tx, {
      signupId: slot.signupId,
      workspaceId: slot.workspaceId,
      actor: { actorId: participantId, actorType: 'participant' },
      eventType: 'commitment.created',
      payload: { commitmentId, slotId },
    });

    return ok({ commitment: row, editToken });
  });
}

export async function getOwnCommitment(
  db: Db,
  commitmentId: string,
  token: string,
): Promise<Result<CommitmentRow & { participantName: string; participantEmail: string }, ServiceError>> {
  const row = await db
    .select({
      c: commitments,
      pname: participants.name,
      pemail: participants.email,
    })
    .from(commitments)
    .innerJoin(participants, eq(participants.id, commitments.participantId))
    .where(eq(commitments.id, commitmentId))
    .limit(1);
  const found = row[0];
  if (!found) return err(serviceError('not_found', 'commitment not found'));

  if (!verifyHash(token, found.c.editTokenHash)) {
    return err(serviceError('forbidden', 'invalid edit token'));
  }
  return ok({ ...found.c, participantName: found.pname, participantEmail: found.pemail });
}

export async function updateOwnCommitment(
  db: Db,
  commitmentId: string,
  token: string,
  rawInput: unknown,
): Promise<Result<CommitmentRow, ServiceError>> {
  const input = parseInputSafe(CommitmentUpdateInputSchema, rawInput);
  if (!input.ok) return input;
  const data: CommitmentUpdateInput = input.value;

  const gotten = await getOwnCommitment(db, commitmentId, token);
  if (!gotten.ok) return gotten;
  const current = gotten.value;

  if (data.swapToSlotId && data.swapToSlotId !== current.slotId) {
    const swapToSlotId = data.swapToSlotId;
    return db.transaction(async (tx) => {
      const target = await tx
        .select({ signupId: slots.signupId })
        .from(slots)
        .where(eq(slots.id, swapToSlotId))
        .limit(1);
      const targetRow = target[0];
      if (!targetRow) return err(serviceError('not_found', 'target slot not found'));
      if (targetRow.signupId !== current.signupId) {
        return err(serviceError('forbidden', 'cannot swap to a slot in a different signup'));
      }

      const cancelled = await tx
        .update(commitments)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(commitments.id, commitmentId),
            or(eq(commitments.status, 'confirmed'), eq(commitments.status, 'tentative')),
          ),
        )
        .returning({ id: commitments.id });
      if (cancelled.length === 0) {
        throw new Error('commitment is not active'); // rolls back the transaction
      }

      const newCommit = await commitToSlot(tx, swapToSlotId, {
        name: data.name ?? current.participantName,
        email: current.participantEmail,
        notes: data.notes ?? current.notes,
        quantity: data.quantity ?? current.quantity,
      });
      if (!newCommit.ok) {
        throw new Error(newCommit.error.message); // rolls back the transaction
      }

      await recordActivity(tx, {
        signupId: current.signupId,
        workspaceId: current.workspaceId,
        actor: { actorId: current.participantId, actorType: 'participant' },
        eventType: 'commitment.swapped',
        payload: { from: current.id, to: newCommit.value.commitment.id },
      });
      return ok(newCommit.value.commitment);
    });
  }

  return db.transaction(async (tx) => {
    // Capacity guard: only fires when quantity *increases* on the same slot.
    // The swap path (slotId change) returns earlier and re-runs the full
    // capacity check via commitToSlot, so a slot move never reaches here.
    if (data.quantity !== undefined && data.quantity > current.quantity) {
      const slotRows = await tx
        .select({ capacity: slots.capacity })
        .from(slots)
        .where(eq(slots.id, current.slotId))
        .for('update')
        .limit(1);
      const cap = slotRows[0]?.capacity ?? null;
      if (cap !== null) {
        const sumRows = await tx
          .select({ sum: sql<number>`coalesce(sum(${commitments.quantity}), 0)::int` })
          .from(commitments)
          .where(
            and(
              eq(commitments.slotId, current.slotId),
              ne(commitments.id, commitmentId),
              or(eq(commitments.status, 'confirmed'), eq(commitments.status, 'tentative')),
            ),
          );
        const otherQty = sumRows[0]?.sum ?? 0;
        if (otherQty + data.quantity > cap) {
          const remaining = Math.max(0, cap - otherQty);
          return err(
            serviceError(
              'capacity_full',
              remaining === 0
                ? 'no spots left for additional quantity'
                : `only ${remaining} left — you asked for ${data.quantity}`,
              {
                details: { remaining, requested: data.quantity, capacity: cap },
                suggestion:
                  remaining === 0
                    ? 'lower the quantity'
                    : `lower the quantity to ${remaining} or fewer`,
              },
            ),
          );
        }
      }
    }

    const [updated] = await tx
      .update(commitments)
      .set({
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        updatedAt: new Date(),
      })
      .where(eq(commitments.id, commitmentId))
      .returning();
    if (!updated) return err(serviceError('internal', 'update returned nothing'));

    if (data.name && data.name !== current.participantName) {
      await tx
        .update(participants)
        .set({ name: data.name })
        .where(eq(participants.id, current.participantId));
    }

    await recordActivity(tx, {
      signupId: current.signupId,
      workspaceId: current.workspaceId,
      actor: { actorId: current.participantId, actorType: 'participant' },
      eventType: 'commitment.updated',
      payload: { commitmentId, changed: Object.keys(data) },
    });
    return ok(updated);
  });
}

export async function cancelOwnCommitment(
  db: Db,
  commitmentId: string,
  token: string,
): Promise<Result<{ cancelled: true }, ServiceError>> {
  const gotten = await getOwnCommitment(db, commitmentId, token);
  if (!gotten.ok) return gotten;
  const current = gotten.value;

  await db.transaction(async (tx) => {
    await tx
      .update(commitments)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(commitments.id, commitmentId));
    await recordActivity(tx, {
      signupId: current.signupId,
      workspaceId: current.workspaceId,
      actor: { actorId: current.participantId, actorType: 'participant' },
      eventType: 'commitment.cancelled',
      payload: { commitmentId },
    });
  });
  return ok({ cancelled: true });
}

export async function listCommitmentsForSignup(db: Db, signupId: string) {
  return db
    .select({
      id: commitments.id,
      slotId: commitments.slotId,
      participantId: commitments.participantId,
      status: commitments.status,
      quantity: commitments.quantity,
      notes: commitments.notes,
      createdAt: commitments.createdAt,
      participantName: participants.name,
      participantEmail: participants.email,
    })
    .from(commitments)
    .innerJoin(participants, eq(participants.id, commitments.participantId))
    .where(eq(commitments.signupId, signupId))
    .orderBy(asc(commitments.createdAt));
}

export async function countCommitmentsForSignup(db: Db, signupId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commitments)
    .where(eq(commitments.signupId, signupId));
  return rows[0]?.count ?? 0;
}
