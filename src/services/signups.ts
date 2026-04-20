import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { commitments } from '@/db/schema/commitments';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { recordActivity } from '@/lib/activity';
import { serviceError, ServiceException, type ServiceError } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import { parseInputSafe } from '@/lib/parse';
import { requireWorkspaceAccess, requireWorkspaceWrite, type Actor } from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';
import { toSlug } from '@/lib/slug';
import {
  type SignupStatus,
  SignupCreateInputSchema,
  SignupUpdateInputSchema,
} from '@/schemas/signups';

type SignupRow = typeof signups.$inferSelect;

export interface SignupWithSlots extends SignupRow {
  slots: (typeof slots.$inferSelect)[];
}

export async function createSignup(
  db: Db,
  actor: Actor,
  workspaceId: string,
  rawInput: unknown,
): Promise<Result<SignupRow, ServiceError>> {
  requireWorkspaceWrite(actor, workspaceId);
  if (actor.kind !== 'organizer') {
    return err(serviceError('unauthorized', 'organizer required'));
  }

  const input = parseInputSafe(SignupCreateInputSchema, rawInput);
  if (!input.ok) return input;
  const data = input.value;

  const id = makeId('sig');
  const slug = await pickAvailableSlug(db, data.title);

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(signups)
      .values({
        id,
        workspaceId,
        organizerId: actor.id,
        slug,
        title: data.title,
        description: data.description,
        visibility: data.visibility,
        tags: data.tags,
        settings: data.settings,
        closesAt: data.closesAt ? new Date(data.closesAt) : null,
        status: 'draft',
      })
      .returning();
    if (!inserted) throw new Error('insert failed');

    await recordActivity(tx, {
      signupId: inserted.id,
      workspaceId,
      actor: { actorId: actor.id, actorType: 'organizer' },
      eventType: 'signup.created',
      payload: { title: inserted.title },
    });
    return inserted;
  });

  return ok(row);
}

export async function getSignupForOrganizer(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SignupWithSlots, ServiceError>> {
  const found = await db.select().from(signups).where(eq(signups.id, signupId)).limit(1);
  const row = found[0];
  if (!row) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceAccess(actor, row.workspaceId);
  const signupSlots = await db
    .select()
    .from(slots)
    .where(eq(slots.signupId, signupId))
    .orderBy(asc(slots.sortOrder), asc(slots.slotAt), asc(slots.createdAt));
  return ok({ ...row, slots: signupSlots });
}

export async function updateSignup(
  db: Db,
  actor: Actor,
  signupId: string,
  rawInput: unknown,
): Promise<Result<SignupRow, ServiceError>> {
  const existing = await db.select().from(signups).where(eq(signups.id, signupId)).limit(1);
  const row = existing[0];
  if (!row) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceWrite(actor, row.workspaceId);

  const input = parseInputSafe(SignupUpdateInputSchema, rawInput);
  if (!input.ok) return input;
  const data = input.value;

  const patched = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(signups)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.closesAt !== undefined
          ? { closesAt: data.closesAt ? new Date(data.closesAt) : null }
          : {}),
        ...(data.settings !== undefined
          ? { settings: { ...(row.settings as object), ...data.settings } }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(signups.id, signupId))
      .returning();
    if (!updated) throw new Error('update returned nothing');

    await recordActivity(tx, {
      signupId,
      workspaceId: row.workspaceId,
      actor: { actorId: (actor as { id: string }).id, actorType: 'organizer' },
      eventType: 'signup.updated',
      payload: { changed: Object.keys(data) },
    });
    return updated;
  });

  return ok(patched);
}

export async function publishSignup(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SignupRow, ServiceError>> {
  return transitionStatus(db, actor, signupId, 'draft', 'open', 'signup.published');
}

export async function closeSignup(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SignupRow, ServiceError>> {
  return transitionStatus(db, actor, signupId, 'open', 'closed', 'signup.closed');
}

export async function archiveSignup(
  db: Db,
  actor: Actor,
  signupId: string,
): Promise<Result<SignupRow, ServiceError>> {
  return transitionStatus(db, actor, signupId, null, 'archived', 'signup.archived');
}

async function transitionStatus(
  db: Db,
  actor: Actor,
  signupId: string,
  from: SignupStatus | null,
  to: SignupStatus,
  eventType: 'signup.published' | 'signup.closed' | 'signup.archived',
): Promise<Result<SignupRow, ServiceError>> {
  const existing = await db.select().from(signups).where(eq(signups.id, signupId)).limit(1);
  const row = existing[0];
  if (!row) return err(serviceError('not_found', 'signup not found'));
  requireWorkspaceWrite(actor, row.workspaceId);

  if (from !== null && row.status !== from) {
    return err(
      serviceError('conflict', `cannot ${to} a signup that is ${row.status}`, {
        field: 'status',
        received: row.status,
        expected: from,
        suggestion: `call the correct transition for status=${row.status}`,
      }),
    );
  }

  if (to === 'open') {
    const slotCount = await db.$count(slots, eq(slots.signupId, signupId));
    if (slotCount < 1) {
      return err(
        serviceError('conflict', 'publish requires at least one slot', {
          suggestion: 'add a slot before publishing',
        }),
      );
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [next] = await tx
      .update(signups)
      .set({
        status: to,
        opensAt: to === 'open' && !row.opensAt ? new Date() : row.opensAt,
        updatedAt: new Date(),
      })
      .where(eq(signups.id, signupId))
      .returning();
    if (!next) throw new Error('update returned nothing');

    await recordActivity(tx, {
      signupId,
      workspaceId: row.workspaceId,
      actor: { actorId: (actor as { id: string }).id, actorType: 'organizer' },
      eventType,
      payload: { from: row.status, to },
    });
    return next;
  });

  return ok(updated);
}

export async function listSignupsForWorkspace(
  db: Db,
  actor: Actor,
  workspaceId: string,
  filter: { status?: SignupStatus } = {},
): Promise<Result<SignupRow[], ServiceError>> {
  requireWorkspaceAccess(actor, workspaceId);
  const where = filter.status
    ? and(eq(signups.workspaceId, workspaceId), eq(signups.status, filter.status))
    : eq(signups.workspaceId, workspaceId);
  const rows = await db
    .select()
    .from(signups)
    .where(and(where, isNull(signups.deletedAt)))
    .orderBy(desc(signups.createdAt))
    .limit(200);
  return ok(rows);
}

export async function getPublicSignup(
  db: Db,
  slug: string,
): Promise<Result<SignupWithSlots & { committerByslot: Record<string, string[]> }, ServiceError>> {
  const found = await db.select().from(signups).where(eq(signups.slug, slug)).limit(1);
  const row = found[0];
  if (!row || row.deletedAt) return err(serviceError('not_found', 'signup not found'));
  if (row.status === 'draft') return err(serviceError('not_found', 'signup not found'));

  const signupSlots = await db
    .select()
    .from(slots)
    .where(eq(slots.signupId, row.id))
    .orderBy(asc(slots.sortOrder), asc(slots.slotAt), asc(slots.createdAt));

  const committerRows = await db
    .select({
      slotId: commitments.slotId,
      participantId: commitments.participantId,
      status: commitments.status,
    })
    .from(commitments)
    .where(
      and(
        eq(commitments.signupId, row.id),
        or(eq(commitments.status, 'confirmed'), eq(commitments.status, 'tentative')),
      ),
    );

  const committerByslot: Record<string, string[]> = {};
  for (const c of committerRows) {
    const list = committerByslot[c.slotId] ?? [];
    list.push(c.participantId);
    committerByslot[c.slotId] = list;
  }

  return ok({ ...row, slots: signupSlots, committerByslot });
}

async function pickAvailableSlug(db: Db, title: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const candidate = toSlug(title, { suffix: true });
    const collision = await db
      .select({ id: signups.id })
      .from(signups)
      .where(eq(signups.slug, candidate))
      .limit(1);
    if (collision.length === 0) return candidate;
  }
  throw new ServiceException(serviceError('internal', 'could not generate unique slug'));
}

