import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { commitments } from '@/db/schema/commitments';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import type { ServiceError } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import type { Result } from '@/lib/result';
import {
  cancelOwnCommitment,
  commitToSlot,
  getOwnCommitment,
  updateOwnCommitment,
} from '@/services/commitments';
import { lockSignupForWrite, readLiveSignup } from '@/services/locks';
import {
  archiveSignup,
  closeSignup,
  createSignup,
  deleteSignup,
  getSignupForOrganizer,
  getSignupRowForOrganizer,
  publishSignup,
  updateSignup,
} from '@/services/signups';
import {
  addField,
  deleteField,
  listFields,
  listFieldsForSignup,
  updateField,
} from '@/services/slot-fields';
import {
  addSlot,
  addSlotsBulk,
  deleteSlot,
  listSlotsForSignup,
  reorderSlots,
  updateSlot,
} from '@/services/slots';
import { settle, untilServiceBlockedOn } from '@/services/testing/locks';

interface Fixture {
  db: Db;
  workspaceId: string;
  organizerId: string;
  actor: Actor;
  /** A second editor, for a delete held open while `actor` runs a service (see below). */
  colleague: Actor;
  colleagueId: string;
}

async function setupWorkspace(): Promise<Fixture> {
  const db = getDb();
  const organizerId = makeId('org');
  const colleagueId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `del-${workspaceId.slice(-8).toLowerCase()}`;

  await db.transaction(async (tx) => {
    await tx.insert(organizers).values([
      { id: organizerId, email: `${slug}@example.test`, name: 'Test Org' },
      { id: colleagueId, email: `colleague-${slug}@example.test`, name: 'Colleague' },
    ]);
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug,
      name: 'Deleted Signup Test',
      type: 'personal',
      plan: 'free',
    });
    await tx.insert(workspaceMembers).values([
      { id: makeId('mem'), workspaceId, organizerId, role: 'owner', status: 'active' },
      {
        id: makeId('mem'),
        workspaceId,
        organizerId: colleagueId,
        role: 'editor',
        status: 'active',
      },
    ]);
  });

  const organizer = (id: string, role: 'owner' | 'editor'): Actor => ({
    kind: 'organizer',
    id,
    email: `${id}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: role },
  });
  return {
    db,
    workspaceId,
    organizerId,
    actor: organizer(organizerId, 'owner'),
    colleague: organizer(colleagueId, 'editor'),
    colleagueId,
  };
}

async function teardownWorkspace(fx: Fixture): Promise<void> {
  await fx.db.delete(workspaces).where(eq(workspaces.id, fx.workspaceId));
  await fx.db.delete(organizers).where(eq(organizers.id, fx.organizerId));
  await fx.db.delete(organizers).where(eq(organizers.id, fx.colleagueId));
}

/**
 * An open signup with a date and a text field, two open slots and a closed
 * one, and one person signed up to the first.
 */
async function makeOpenSignup(fx: Fixture, title: string) {
  const created = await createSignup(
    fx.db,
    fx.actor,
    fx.workspaceId,
    { title },
    {
      template: {
        id: 'deleted-test',
        fields: [
          {
            ref: 'day',
            label: 'Day',
            fieldType: 'date',
            sortOrder: 0,
            config: { fieldType: 'date' },
          },
          {
            ref: 'note',
            label: 'Note',
            fieldType: 'text',
            sortOrder: 1,
            config: { fieldType: 'text', maxLength: 200 },
          },
        ],
        slots: [],
      },
    },
  );
  if (!created.ok) throw new Error(created.error.message);
  const signupId = created.value.id;
  const a = await addSlot(fx.db, fx.actor, signupId, {
    values: { day: '2030-05-01' },
    capacity: 5,
  });
  const b = await addSlot(fx.db, fx.actor, signupId, {
    values: { day: '2030-05-02' },
    capacity: 5,
  });
  const closed = await addSlot(fx.db, fx.actor, signupId, {
    values: { day: '2030-05-03' },
    capacity: 5,
  });
  if (!a.ok || !b.ok || !closed.ok) throw new Error('slot setup failed');
  const shut = await updateSlot(fx.db, fx.actor, closed.value.id, { status: 'closed' });
  if (!shut.ok) throw new Error(shut.error.message);
  const pub = await publishSignup(fx.db, fx.actor, signupId);
  if (!pub.ok) throw new Error(pub.error.message);
  const commit = await commitToSlot(fx.db, a.value.id, {
    name: 'Pat Example',
    email: `pat-${signupId.slice(-8).toLowerCase()}@example.test`,
    quantity: 1,
  });
  if (!commit.ok) throw new Error(commit.error.message);
  const fields = await listFieldsForSignup(fx.db, signupId);
  const noteFieldId = fields.find((f) => f.ref === 'note')!.id;
  return {
    signupId,
    slotA: a.value.id,
    slotB: b.value.id,
    slotClosed: closed.value.id,
    noteFieldId,
    commitmentId: commit.value.commitment.id,
    editToken: commit.value.editToken,
  };
}

/** Everything a refused write could have changed, to compare before and after. */
async function snapshot(db: Db, signupId: string) {
  const [row] = await db.select().from(signups).where(eq(signups.id, signupId));
  return {
    signup: row,
    slots: await listSlotsForSignup(db, signupId),
    fields: await listFieldsForSignup(db, signupId),
    commitments: await db.select().from(commitments).where(eq(commitments.signupId, signupId)),
    activity: (await db.select().from(activity).where(eq(activity.signupId, signupId))).length,
  };
}

type Made = Awaited<ReturnType<typeof makeOpenSignup>>;
type Call = (fx: Fixture, s: Made) => Promise<Result<unknown, ServiceError>>;

// Every service a deleted signup could still be reached through: the public
// commit by slot id, each organizer write by signup, slot or field id, and the
// organizer reads. Deleting leaves `status` as it was (`open` here), so none of
// them can lean on the status check.
const CALLS: Array<[string, Call]> = [
  [
    'commitToSlot',
    (fx, s) =>
      commitToSlot(fx.db, s.slotB, { name: 'Sam Example', email: 'sam@example.com', quantity: 1 }),
  ],
  // A closed slot too: the deleted signup is found out first, so it is not
  // found rather than closed, and no attempt_failed row lands in its log.
  [
    'commitToSlot on a closed slot',
    (fx, s) =>
      commitToSlot(fx.db, s.slotClosed, {
        name: 'Sam Example',
        email: 'sam@example.com',
        quantity: 1,
      }),
  ],
  // The person already signed up, through their edit link.
  ['getOwnCommitment', (fx, s) => getOwnCommitment(fx.db, s.commitmentId, s.editToken)],
  [
    'updateOwnCommitment',
    (fx, s) => updateOwnCommitment(fx.db, s.commitmentId, s.editToken, { quantity: 4 }),
  ],
  ['cancelOwnCommitment', (fx, s) => cancelOwnCommitment(fx.db, s.commitmentId, s.editToken)],
  ['addSlot', (fx, s) => addSlot(fx.db, fx.actor, s.signupId, { values: { day: '2030-05-03' } })],
  [
    'addSlotsBulk',
    (fx, s) =>
      addSlotsBulk(fx.db, fx.actor, s.signupId, { rows: [{ values: { day: '2030-05-04' } }] }),
  ],
  ['updateSlot', (fx, s) => updateSlot(fx.db, fx.actor, s.slotA, { capacity: 9 })],
  ['deleteSlot', (fx, s) => deleteSlot(fx.db, fx.actor, s.slotB)],
  [
    'reorderSlots',
    (fx, s) => reorderSlots(fx.db, fx.actor, s.signupId, { slotIds: [s.slotB, s.slotA] }),
  ],
  [
    'addField',
    (fx, s) =>
      addField(fx.db, fx.actor, s.signupId, {
        ref: 'extra',
        label: 'Extra',
        fieldType: 'text',
        config: { fieldType: 'text', maxLength: 50 },
      }),
  ],
  ['updateField', (fx, s) => updateField(fx.db, fx.actor, s.noteFieldId, { label: 'Renamed' })],
  ['deleteField', (fx, s) => deleteField(fx.db, fx.actor, s.noteFieldId)],
  ['updateSignup', (fx, s) => updateSignup(fx.db, fx.actor, s.signupId, { title: 'Renamed' })],
  ['publishSignup', (fx, s) => publishSignup(fx.db, fx.actor, s.signupId)],
  ['closeSignup', (fx, s) => closeSignup(fx.db, fx.actor, s.signupId)],
  ['archiveSignup', (fx, s) => archiveSignup(fx.db, fx.actor, s.signupId)],
  ['listFields', (fx, s) => listFields(fx.db, fx.actor, s.signupId)],
  ['getSignupRowForOrganizer', (fx, s) => getSignupRowForOrganizer(fx.db, fx.actor, s.signupId)],
  ['getSignupForOrganizer', (fx, s) => getSignupForOrganizer(fx.db, fx.actor, s.signupId)],
];

describe('a deleted signup is gone to every service (db)', () => {
  let fx: Fixture;
  let made: Made;
  let before: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    fx = await setupWorkspace();
    made = await makeOpenSignup(fx, 'Deleted while open');
    const gone = await deleteSignup(fx.db, fx.actor, made.signupId);
    if (!gone.ok) throw new Error(gone.error.message);
    expect(gone.value.status).toBe('open');
    before = await snapshot(fx.db, made.signupId);
  });

  afterAll(async () => {
    if (fx) await teardownWorkspace(fx); // else setup failed: let its own error show
  });

  it.each(CALLS)('%s is not_found', async (_name, call) => {
    const r = await call(fx, made);
    expect(r.ok, JSON.stringify(r)).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_found');
  });

  it('none of them wrote anything, the activity log included', async () => {
    expect(await snapshot(fx.db, made.signupId)).toEqual(before);
  });

  it('readLiveSignup and lockSignupForWrite do not return it', async () => {
    expect(await readLiveSignup(fx.db, made.signupId)).toBeUndefined();
    await fx.db.transaction(async (tx) => {
      expect(await lockSignupForWrite(tx, made.signupId, fx.workspaceId)).toBeUndefined();
    });
  });
});

// The same, for a delete that commits while the service waits on the signup
// lock: the lock reads the row again once the delete lets go of it. The delete
// runs as the colleague, since `recordActivity` touches the actor's organizers
// row and two services run by one person would meet there, lock or no lock.
describe('a service queued behind a signup delete (db)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await setupWorkspace();
  });

  afterAll(async () => {
    if (fx) await teardownWorkspace(fx); // else setup failed: let its own error show
  });

  const QUEUED: Array<[string, Call]> = [
    [
      'addField',
      (fx, s) =>
        addField(fx.db, fx.actor, s.signupId, {
          ref: 'extra',
          label: 'Extra',
          fieldType: 'text',
          config: { fieldType: 'text', maxLength: 50 },
        }),
    ],
    ['updateField', (fx, s) => updateField(fx.db, fx.actor, s.noteFieldId, { label: 'Renamed' })],
    ['deleteField', (fx, s) => deleteField(fx.db, fx.actor, s.noteFieldId)],
    [
      'reorderSlots',
      (fx, s) => reorderSlots(fx.db, fx.actor, s.signupId, { slotIds: [s.slotB, s.slotA] }),
    ],
    [
      'addSlotsBulk',
      (fx, s) =>
        addSlotsBulk(fx.db, fx.actor, s.signupId, { rows: [{ values: { day: '2030-05-04' } }] }),
    ],
    ['updateSignup', (fx, s) => updateSignup(fx.db, fx.actor, s.signupId, { title: 'Renamed' })],
    // These two read the signup unlocked and pass their status check, then
    // queue on the delete's row lock in their UPDATE, which skips a deleted row.
    ['closeSignup', (fx, s) => closeSignup(fx.db, fx.actor, s.signupId)],
    ['archiveSignup', (fx, s) => archiveSignup(fx.db, fx.actor, s.signupId)],
  ];

  it.each(QUEUED)('%s is not_found and writes nothing', async (name, call) => {
    const s = await makeOpenSignup(fx, `Queued ${name}`);
    const before = await snapshot(fx.db, s.signupId);
    let running: Promise<Result<unknown, ServiceError>> | undefined;
    const held = fx.db.transaction(async (tx) => {
      // The soft delete's update holds the signup row the way the lock does.
      const gone = await deleteSignup(tx as unknown as Db, fx.colleague, s.signupId);
      expect(gone.ok, JSON.stringify(gone)).toBe(true);
      // Still sees a live signup, since the delete has not committed.
      running = call(fx, s);
      await untilServiceBlockedOn(fx.db, tx, running);
    });
    await held.finally(() => settle(running));

    const r = await running!;
    expect(r.ok, JSON.stringify(r)).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_found');
    // Only the delete itself changed anything: its deleted_at and its one
    // activity row.
    const after = await snapshot(fx.db, s.signupId);
    expect(after.signup?.deletedAt).toBeInstanceOf(Date);
    expect({ ...after, signup: undefined, activity: after.activity - 1 }).toEqual({
      ...before,
      signup: undefined,
    });
  });
});
