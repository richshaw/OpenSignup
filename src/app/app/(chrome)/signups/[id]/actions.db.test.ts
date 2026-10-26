import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { slots as slotsTable } from '@/db/schema/slots';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { publishCheckCopy, publishCheckTarget, type PublishCheck } from '@/lib/publish-check';
import { EMPTY_TEMPLATE } from '@/lib/signup-templates';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot, updateSlot } from '@/services/slots';
import {
  closeAction,
  closeQuestionAction,
  deleteSignupAction,
  publishAction,
  reopenAction,
  setRequireEmailAction,
} from './actions';

// The action reads the organizer from the session cookie. Tests hand it one
// directly instead of going through Auth.js.
const session = vi.hoisted(() => ({ actor: { kind: 'anonymous' } as Actor }));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({}),
  toActor: () => session.actor,
}));

// Next's redirect() throws to end the action; this one throws the address.
class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`);
  }
}
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath }));

/** Where an action sends the organizer when it ends. */
async function redirectOf(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (e) {
    if (e instanceof Redirected) return e.url;
    throw e;
  }
  throw new Error('the action did not redirect');
}

async function submit(signupId: string, choice: 'required' | 'optional'): Promise<string> {
  const form = new FormData();
  form.set('requireEmail', choice);
  return redirectOf(() => setRequireEmailAction(signupId, form));
}

describe('setRequireEmailAction (db)', () => {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `test-${workspaceId.slice(-8).toLowerCase()}`;
  const email = `${slug}@example.test`;
  const owner: Actor = {
    kind: 'organizer',
    id: organizerId,
    email,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  // requireWorkspaceWrite reads actor.workspaceRoles, so no member row is needed.
  const viewer: Actor = {
    kind: 'organizer',
    id: makeId('org'),
    email: 'viewer@example.test',
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'viewer' },
  };
  let signupId: string;

  const stored = async () => {
    const [row] = await db
      .select({ settings: signups.settings })
      .from(signups)
      .where(eq(signups.id, signupId));
    return row?.settings as Record<string, unknown>;
  };
  const updates = async () =>
    db
      .select({ id: activity.id })
      .from(activity)
      .where(and(eq(activity.signupId, signupId), eq(activity.eventType, 'signup.updated')));

  beforeAll(async () => {
    await db.transaction(async (tx) => {
      await tx.insert(organizers).values({ id: organizerId, email, name: 'Test Org' });
      await tx.insert(workspaces).values({
        id: workspaceId,
        slug,
        name: 'Test Workspace',
        type: 'personal',
        plan: 'free',
      });
      await tx.insert(workspaceMembers).values({
        id: makeId('mem'),
        workspaceId,
        organizerId,
        role: 'owner',
        status: 'active',
      });
    });
    const created = await createSignup(db, owner, workspaceId, {
      title: 'Email setting',
      description: '',
      tags: [],
      visibility: 'unlisted',
      settings: {},
    });
    if (!created.ok) throw new Error(created.error.message);
    signupId = created.value.id;
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  beforeEach(() => {
    revalidatePath.mockClear();
  });

  it('saves the choice and comes back saying so', async () => {
    session.actor = owner;
    expect(await submit(signupId, 'optional')).toBe(`/app/signups/${signupId}/settings?saved=1`);
    expect((await stored()).requireEmail).toBe(false);
    expect(revalidatePath).toHaveBeenCalled();

    expect(await submit(signupId, 'required')).toBe(`/app/signups/${signupId}/settings?saved=1`);
    expect((await stored()).requireEmail).toBe(true);
  });

  // The write guard throws for a viewer rather than returning a Result.
  it('refuses a viewer in plain words and writes nothing', async () => {
    session.actor = owner;
    await submit(signupId, 'optional');
    const before = await stored();
    const updatesBefore = (await updates()).length;
    revalidatePath.mockClear();

    session.actor = viewer;
    const url = await submit(signupId, 'required');
    expect(url).toBe(
      `/app/signups/${signupId}/settings?error=${encodeURIComponent('You don’t have edit access.')}`,
    );
    expect(url).not.toMatch(/saved|cannot%20modify/);
    expect(await stored()).toEqual(before);
    expect(await updates()).toHaveLength(updatesBefore);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('says a signup that is gone is no longer available', async () => {
    session.actor = owner;
    expect(await submit('sig_nope', 'optional')).toBe(
      `/app/signups/sig_nope/settings?error=${encodeURIComponent('No longer available.')}`,
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// The same tab's Delete, whose refusal reads like Save's.
describe('deleteSignupAction (db)', () => {
  it('says a signup that is gone is no longer available, not the service text', async () => {
    session.actor = {
      kind: 'organizer',
      id: makeId('org'),
      email: 'pat@example.test',
      workspaceIds: [],
      workspaceRoles: {},
    };
    const url = await redirectOf(() => deleteSignupAction('sig_nope'));
    expect(url).toBe(
      `/app/signups/sig_nope/settings?error=${encodeURIComponent('No longer available.')}`,
    );
    expect(url).not.toMatch(/signup%20not%20found/);
  });
});

// A viewer's refusal is thrown by the policy guard, not returned. Each action
// turns it into a message rather than letting it reach the error page.
describe('a viewer choosing Publish, Close, Reopen or Delete (db)', () => {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `test-${workspaceId.slice(-8).toLowerCase()}`;
  const owner: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${slug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  const viewer: Actor = {
    kind: 'organizer',
    id: makeId('org'),
    email: 'viewer@example.test',
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'viewer' },
  };
  let signupId: string;

  const row = async () => {
    const [found] = await db
      .select({ status: signups.status, deletedAt: signups.deletedAt })
      .from(signups)
      .where(eq(signups.id, signupId));
    return found;
  };

  beforeAll(async () => {
    await db.transaction(async (tx) => {
      await tx.insert(organizers).values({ id: organizerId, email: owner.email, name: 'Test Org' });
      await tx.insert(workspaces).values({
        id: workspaceId,
        slug,
        name: 'Test Workspace',
        type: 'personal',
        plan: 'free',
      });
    });
    const created = await createSignup(db, owner, workspaceId, {
      title: 'Viewer refusals',
      description: '',
      tags: [],
      visibility: 'unlisted',
      settings: {},
    });
    if (!created.ok) throw new Error(created.error.message);
    signupId = created.value.id;
    // Something to sign up for, so Publish's check lets it through.
    const slot = await addSlot(db, owner, signupId, { values: { what: 'Juice' }, capacity: 1 });
    if (!slot.ok) throw new Error(slot.error.message);
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  beforeEach(() => {
    revalidatePath.mockClear();
  });

  it('Publish says the viewer can’t edit and leaves the draft as it was', async () => {
    session.actor = viewer;
    expect(await publishAction(signupId)).toEqual({ error: 'You don’t have edit access.' });
    expect((await row())?.status).toBe('draft');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('Publish says it published and re-renders the signup where it was pressed', async () => {
    session.actor = owner;
    expect(await publishAction(signupId)).toEqual({ published: true });
    expect((await row())?.status).toBe('open');
    expect(revalidatePath).toHaveBeenCalledWith(`/app/signups/${signupId}`, 'layout');
  });

  it('Publish on a signup that’s already open asks for a reload', async () => {
    session.actor = owner;
    expect(await publishAction(signupId)).toEqual({
      error: 'This signup changed since the page loaded. Reload to see the latest.',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('Close says the viewer can’t edit and leaves the signup open', async () => {
    session.actor = viewer;
    expect(await closeAction(signupId)).toEqual({ error: 'You don’t have edit access.' });
    expect((await row())?.status).toBe('open');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('Close on a signup that’s no longer open asks for a reload', async () => {
    session.actor = owner;
    expect(await closeAction(signupId)).toBeNull();
    expect((await row())?.status).toBe('closed');
    expect(await closeAction(signupId)).toEqual({
      error: 'This signup changed since the page loaded. Reload to see the latest.',
    });
  });

  it('Reopen says the viewer can’t edit and leaves the signup closed', async () => {
    session.actor = viewer;
    expect(await reopenAction(signupId)).toEqual({ error: 'You don’t have edit access.' });
    expect((await row())?.status).toBe('closed');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('Reopen opens a closed signup again and re-renders it where it was pressed', async () => {
    session.actor = owner;
    expect(await reopenAction(signupId)).toBeNull();
    expect((await row())?.status).toBe('open');
    expect(revalidatePath).toHaveBeenCalledWith(`/app/signups/${signupId}`, 'layout');
    const reopened = await db
      .select({ payload: activity.payload })
      .from(activity)
      .where(and(eq(activity.signupId, signupId), eq(activity.eventType, 'signup.reopened')));
    expect(reopened.map((r) => r.payload)).toEqual([{ from: 'closed', to: 'open' }]);
  });

  it('Reopen on a signup that’s already open asks for a reload', async () => {
    session.actor = owner;
    expect(await reopenAction(signupId)).toEqual({
      error: 'This signup changed since the page loaded. Reload to see the latest.',
    });
    expect((await row())?.status).toBe('open');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('Delete comes back to Settings saying the viewer can’t edit', async () => {
    session.actor = viewer;
    const url = await redirectOf(() => deleteSignupAction(signupId));
    expect(url).toBe(
      `/app/signups/${signupId}/settings?error=${encodeURIComponent('You don’t have edit access.')}`,
    );
    expect((await row())?.deletedAt).toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// Publish checks a draft as it's stored before publishing it (#503).
describe('Publish’s check (db)', () => {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `test-${workspaceId.slice(-8).toLowerCase()}`;
  const owner: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${slug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  const viewer: Actor = {
    kind: 'organizer',
    id: makeId('org'),
    email: 'viewer@example.test',
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'viewer' },
  };

  /**
   * A fresh draft. The default template gives it What and Date and one empty
   * slot; the empty one gives it neither. `slots` adds slots after that.
   */
  async function draft(
    slots: Record<string, unknown>[] = [],
    { empty = false }: { empty?: boolean } = {},
  ): Promise<{ id: string; slotIds: string[] }> {
    const created = await createSignup(
      db,
      owner,
      workspaceId,
      {
        title: 'Check before publishing',
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
      empty ? { template: EMPTY_TEMPLATE } : {},
    );
    if (!created.ok) throw new Error(created.error.message);
    const slotIds: string[] = [];
    for (const values of slots) {
      const slot = await addSlot(db, owner, created.value.id, { values, capacity: 1 });
      if (!slot.ok) throw new Error(slot.error.message);
      slotIds.push(slot.value.id);
    }
    return { id: created.value.id, slotIds };
  }

  const statusOf = async (id: string) => {
    const [found] = await db
      .select({ status: signups.status })
      .from(signups)
      .where(eq(signups.id, id));
    return found?.status;
  };
  const slotsOf = async (id: string) =>
    (
      await db
        .select({ id: slotsTable.id, sortOrder: slotsTable.sortOrder })
        .from(slotsTable)
        .where(eq(slotsTable.signupId, id))
    )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.id);
  const anyway = () => {
    const form = new FormData();
    form.set('acknowledge', 'placeholder');
    return form;
  };
  const answer = (check: PublishCheck) => ({
    check,
    copy: publishCheckCopy(check),
    target: publishCheckTarget(check),
  });

  beforeAll(async () => {
    await db.transaction(async (tx) => {
      await tx.insert(organizers).values({ id: organizerId, email: owner.email, name: 'Test Org' });
      await tx.insert(workspaces).values({
        id: workspaceId,
        slug,
        name: 'Test Workspace',
        type: 'personal',
        plan: 'free',
      });
    });
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  beforeEach(() => {
    revalidatePath.mockClear();
    session.actor = owner;
  });

  it('stops a draft with no slots and leaves it a draft', async () => {
    const { id } = await draft([], { empty: true });
    expect(await publishAction(id)).toEqual(answer({ kind: 'no_slots' }));
    expect(await statusOf(id)).toBe('draft');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('stops a draft with slots but no fields', async () => {
    const { id } = await draft([{}], { empty: true });
    expect(await publishAction(id)).toEqual(answer({ kind: 'no_fields' }));
    expect(await statusOf(id)).toBe('draft');
  });

  it('stops a draft whose every slot is empty, pointing at the first', async () => {
    const { id } = await draft([{ what: '  ' }]);
    const [first] = await slotsOf(id);
    expect(await publishAction(id)).toEqual(
      answer({ kind: 'all_blank', slotId: first!, slotCount: 2 }),
    );
    expect(await statusOf(id)).toBe('draft');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('warns about a slot that still says TBD, and leaves it a draft', async () => {
    const { id, slotIds } = await draft([
      { what: 'Setup', date: '2026-11-14' },
      { what: 'Cashier TBD', date: '2026-11-14' },
    ]);
    expect(await publishAction(id)).toEqual(
      answer({
        kind: 'placeholder',
        slotIds: [slotIds[1]!],
        words: ['TBD'],
        fieldRef: 'what',
        slotLabel: 'Cashier TBD · Sat, Nov 14',
      }),
    );
    expect(await statusOf(id)).toBe('draft');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('publishes past the warning once the organizer chooses Publish anyway', async () => {
    const { id } = await draft([{ what: 'Cashier TBD' }]);
    expect(await publishAction(id, anyway())).toEqual({ published: true });
    expect(await statusOf(id)).toBe('open');
    expect(revalidatePath).toHaveBeenCalledWith(`/app/signups/${id}`, 'layout');
  });

  it('still stops a blocking problem when the form says Publish anyway', async () => {
    const { id } = await draft();
    const [first] = await slotsOf(id);
    expect(await publishAction(id, anyway())).toEqual(
      answer({ kind: 'all_blank', slotId: first!, slotCount: 1 }),
    );
    expect(await statusOf(id)).toBe('draft');
  });

  it('refuses a viewer before checking anything', async () => {
    const { id } = await draft();
    session.actor = viewer;
    expect(await publishAction(id)).toEqual({ error: 'You don’t have edit access.' });
    expect(await statusOf(id)).toBe('draft');
  });

  it('doesn’t check a signup that’s no longer a draft: it asks for a reload', async () => {
    // Published by an AI assistant, say, which publishes without the check.
    const { id } = await draft();
    const published = await publishSignup(db, owner, id);
    if (!published.ok) throw new Error(published.error.message);
    expect(await publishAction(id)).toEqual({
      error: 'This signup changed since the page loaded. Reload to see the latest.',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // #525 counts refused publishes. The check now stops what the service used
  // to refuse, so it writes the same row.
  describe('signup.publish_refused', () => {
    const refusalRows = async (id: string) =>
      db
        .select({ payload: activity.payload, actorId: activity.actorId })
        .from(activity)
        .where(and(eq(activity.signupId, id), eq(activity.eventType, 'signup.publish_refused')));
    const refusals = async (id: string) => (await refusalRows(id)).map((row) => row.payload);

    it.each<[string, () => Promise<{ id: string }>, Record<string, unknown>]>([
      ['no slots', () => draft([], { empty: true }), { code: 'conflict', reason: 'no_slots' }],
      ['no fields', () => draft([{}], { empty: true }), { code: 'conflict', reason: 'no_fields' }],
      ['every slot empty', () => draft(), { code: 'conflict', reason: 'all_blank' }],
      [
        'a slot still saying TBD',
        () => draft([{ what: 'Cashier TBD' }]),
        { reason: 'placeholder', warning: true },
      ],
    ])('writes one row when the check stops %s', async (_name, make, payload) => {
      const { id } = await make();
      await publishAction(id);
      // By the organizer who pressed Publish and share.
      expect(await refusalRows(id)).toEqual([{ payload, actorId: organizerId }]);
    });

    it('writes no more once the organizer chooses Publish anyway', async () => {
      const { id } = await draft([{ what: 'Cashier TBD' }]);
      await publishAction(id);
      expect(await publishAction(id, anyway())).toEqual({ published: true });
      expect(await refusals(id)).toEqual([{ reason: 'placeholder', warning: true }]);
    });

    it('writes nothing for a viewer, who is refused before the check', async () => {
      const { id } = await draft();
      session.actor = viewer;
      await publishAction(id);
      expect(await refusals(id)).toEqual([]);
    });

    it('still comes from the service when it refuses a publish the check didn’t see', async () => {
      // The MCP tool and the REST API publish through the service alone.
      const { id } = await draft([], { empty: true });
      const refused = await publishSignup(db, owner, id);
      expect(refused.ok).toBe(false);
      expect(await refusals(id)).toEqual([{ code: 'conflict', reason: 'no_slots' }]);
    });
  });

  // After a warning, signup.published says whether the organizer chose
  // Publish anyway, or fixed the slot first.
  describe('signup.published after a warning', () => {
    const published = async (id: string) =>
      (
        await db
          .select({ payload: activity.payload })
          .from(activity)
          .where(and(eq(activity.signupId, id), eq(activity.eventType, 'signup.published')))
      ).map((row) => row.payload);

    it('says acknowledged: placeholder when Publish anyway published past it', async () => {
      const { id } = await draft([{ what: 'Cashier TBD' }]);
      await publishAction(id);
      await publishAction(id, anyway());
      expect(await published(id)).toEqual([
        { from: 'draft', to: 'open', acknowledged: 'placeholder' },
      ]);
    });

    it('says nothing more when the organizer named the slot first', async () => {
      const { id, slotIds } = await draft([{ what: 'Cashier TBD' }]);
      await publishAction(id);
      const named = await updateSlot(db, owner, slotIds[0]!, { values: { what: 'Cashier' } });
      if (!named.ok) throw new Error(named.error.message);
      expect(await publishAction(id)).toEqual({ published: true });
      expect(await published(id)).toEqual([{ from: 'draft', to: 'open' }]);
    });

    it('says nothing more when the slot was named before Publish anyway reached the server', async () => {
      // The form still says Publish anyway, but there's nothing to publish past.
      const { id, slotIds } = await draft([{ what: 'Cashier TBD' }]);
      await publishAction(id);
      const named = await updateSlot(db, owner, slotIds[0]!, { values: { what: 'Cashier' } });
      if (!named.ok) throw new Error(named.error.message);
      await publishAction(id, anyway());
      expect(await published(id)).toEqual([{ from: 'draft', to: 'open' }]);
    });
  });
});

describe('closeQuestionAction (db)', () => {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const slug = `test-${workspaceId.slice(-8).toLowerCase()}`;
  const owner: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${slug}@example.test`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  const after = ' People can’t sign up until you reopen it.';
  let signupId: string;
  let slotId: string;

  beforeAll(async () => {
    await db.transaction(async (tx) => {
      await tx.insert(organizers).values({ id: organizerId, email: owner.email, name: 'Test Org' });
      await tx.insert(workspaces).values({
        id: workspaceId,
        slug,
        name: 'Test Workspace',
        type: 'personal',
        plan: 'free',
      });
    });
    // A new signup starts with one empty slot of 1 spot; this adds one of 4.
    const created = await createSignup(db, owner, workspaceId, {
      title: 'Close question',
      description: '',
      tags: [],
      visibility: 'unlisted',
      settings: {},
    });
    if (!created.ok) throw new Error(created.error.message);
    signupId = created.value.id;
    const slot = await addSlot(db, owner, signupId, { values: { what: 'Juice' }, capacity: 4 });
    if (!slot.ok) throw new Error(slot.error.message);
    slotId = slot.value.id;
    const published = await publishSignup(db, owner, signupId);
    if (!published.ok) throw new Error(published.error.message);
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  beforeEach(() => {
    revalidatePath.mockClear();
  });

  it('asks from the spots taken now, and revalidates nothing', async () => {
    session.actor = owner;
    expect(await closeQuestionAction(signupId)).toEqual({
      question: `Nobody has signed up yet.${after}`,
    });

    const commit = await commitToSlot(db, slotId, {
      name: 'Sam Example',
      email: `sam-${slug}@example.test`,
      quantity: 1,
    });
    if (!commit.ok) throw new Error(commit.error.message);
    expect(await closeQuestionAction(signupId)).toEqual({
      question: `4 of 5 spots are still open.${after} Everyone already signed up keeps their spot.`,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('comes back with a refusal, not an error, for someone who can’t see the signup', async () => {
    // What Close signup itself would say next.
    session.actor = { kind: 'anonymous' };
    expect(await closeQuestionAction(signupId)).toEqual({
      error: 'Couldn’t close the signup. Try again.',
    });

    session.actor = owner;
    expect(await closeQuestionAction('sig_nope')).toEqual({
      error: 'This signup is no longer available.',
    });
  });
});
