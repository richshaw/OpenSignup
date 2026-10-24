import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import {
  closeAction,
  closeQuestionAction,
  deleteSignupAction,
  publishAction,
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
describe('a viewer choosing Publish, Close or Delete (db)', () => {
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
    const slot = await addSlot(db, owner, signupId, { values: {}, capacity: 1 });
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
  const after = ' People can’t sign up after this, and you can’t reopen it.';
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
      question: `4 of 5 spots are still open.${after}`,
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
