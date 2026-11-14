import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import { ship } from '@/i18n/testing/ship';
import { ServiceException } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import type { SignupStatus, StoredSignupSettings } from '@/schemas/signups';
import { lockSignupForWrite } from './locks';
import { openSignupsToSwitch, setOpenSignupsLocale, updateSignup } from './signups';
import { settle, untilServiceBlockedOn } from './testing/locks';

// The instance's DEFAULT_LOCALE as a test sets it (getEnv() parses the
// environment once): unset unless a test sets it.
const instance = vi.hoisted(() => ({ defaultLocale: undefined as string | undefined }));
vi.mock('@/i18n/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/server')>()),
  instanceDefaultLocale: () => instance.defaultLocale,
}));

const db = getDb();

// Pat, whose open signups these are, shares a workspace with Sam, only views
// a second one, and once made a signup in a third they've since left.
const pat = makeId('org');
const sam = makeId('org');
const shared = makeId('ws');
const viewed = makeId('ws');
const left = makeId('ws');

const patActor: Actor = {
  kind: 'organizer',
  id: pat,
  email: 'pat@example.com',
  workspaceIds: [shared, viewed],
  workspaceRoles: { [shared]: 'owner', [viewed]: 'viewer' },
};
const samActor: Actor = {
  kind: 'organizer',
  id: sam,
  email: 'sam@example.com',
  workspaceIds: [shared],
  workspaceRoles: { [shared]: 'editor' },
};

const made: string[] = [];

/** A signup as stored, with nothing of a real one but what this reads. */
async function signup({
  organizerId = pat,
  workspaceId = shared,
  status = 'open',
  settings = { requireEmail: false },
  deleted = false,
}: {
  organizerId?: string;
  workspaceId?: string;
  status?: SignupStatus;
  settings?: StoredSignupSettings;
  deleted?: boolean;
} = {}): Promise<string> {
  const id = makeId('sig');
  await db.insert(signups).values({
    id,
    workspaceId,
    organizerId,
    slug: `test-${id.slice(-10).toLowerCase()}`,
    title: 'Bake sale',
    status,
    settings,
    deletedAt: deleted ? new Date() : null,
  });
  made.push(id);
  return id;
}

async function settingsOf(id: string) {
  const [row] = await db
    .select({ settings: signups.settings })
    .from(signups)
    .where(eq(signups.id, id));
  return row?.settings;
}

async function updatesOf(ids: string[]) {
  return db
    .select({ signupId: activity.signupId, payload: activity.payload, actorId: activity.actorId })
    .from(activity)
    .where(and(inArray(activity.signupId, ids), eq(activity.eventType, 'signup.updated')));
}

beforeAll(async () => {
  await db.insert(organizers).values([
    { id: pat, email: `${pat.toLowerCase()}@example.com` },
    { id: sam, email: `${sam.toLowerCase()}@example.com` },
  ]);
  await db.insert(workspaces).values(
    [shared, viewed, left].map((id) => ({
      id,
      slug: `test-${id.slice(-8).toLowerCase()}`,
      name: 'Test Workspace',
      type: 'team',
      plan: 'free',
    })),
  );
  await db.insert(workspaceMembers).values([
    { id: makeId('mem'), workspaceId: shared, organizerId: pat, role: 'owner', status: 'active' },
    { id: makeId('mem'), workspaceId: shared, organizerId: sam, role: 'editor', status: 'active' },
    { id: makeId('mem'), workspaceId: viewed, organizerId: pat, role: 'viewer', status: 'active' },
  ]);
});

afterAll(async () => {
  await db.delete(workspaces).where(inArray(workspaces.id, [shared, viewed, left]));
  await db.delete(organizers).where(inArray(organizers.id, [pat, sam]));
});

beforeEach(async () => {
  instance.defaultLocale = undefined;
  if (made.length > 0) await db.delete(signups).where(inArray(signups.id, made.splice(0)));
});

describe('setOpenSignupsLocale (db)', () => {
  it('puts each of the organizer’s open signups in the language, keeping their other settings', async () => {
    ship('participant', ['en', 'sv']);
    const none = await signup();
    const english = await signup({ settings: { requireEmail: false, locale: 'en' } });

    const result = await setOpenSignupsLocale(db, patActor, 'sv');

    expect(result).toEqual({
      ok: true,
      value: { locale: 'sv', signupIds: [none, english].sort() },
    });
    expect(await settingsOf(none)).toEqual({ requireEmail: false, locale: 'sv' });
    expect(await settingsOf(english)).toEqual({ requireEmail: false, locale: 'sv' });
  });

  it('writes each one the activity row a save on its Settings tab writes', async () => {
    ship('participant', ['en', 'sv']);
    // A draft, which the change leaves to its own Settings tab.
    const [bulk, byHand] = [await signup(), await signup({ status: 'draft' })];

    await setOpenSignupsLocale(db, patActor, 'sv');
    // The Settings tab's "Signup language" sends only the language.
    expect((await updateSignup(db, patActor, byHand, { settings: { locale: 'en' } })).ok).toBe(
      true,
    );

    const rows = await updatesOf([bulk, byHand]);
    expect(rows).toHaveLength(2);
    const [fromBulk, fromTab] = [bulk, byHand].map((id) => rows.find((r) => r.signupId === id));
    expect(fromBulk).toEqual({ ...fromTab, signupId: bulk });
    expect(fromBulk).toMatchObject({ actorId: pat, payload: { changed: ['settings'] } });
  });

  it('leaves drafts, closed, archived and deleted signups, others’, and those in a workspace the organizer only views or has left', async () => {
    ship('participant', ['en', 'sv']);
    const open = await signup();
    const untouched = [
      await signup({ status: 'draft' }),
      await signup({ status: 'closed' }),
      await signup({ status: 'archived' }),
      await signup({ deleted: true }),
      await signup({ organizerId: sam }),
      await signup({ workspaceId: viewed }),
      await signup({ workspaceId: left }),
    ];

    expect(await openSignupsToSwitch(db, patActor, 'sv')).toEqual({ ok: true, value: [open] });
    const result = await setOpenSignupsLocale(db, patActor, 'sv');

    expect(result).toEqual({ ok: true, value: { locale: 'sv', signupIds: [open] } });
    for (const id of untouched) expect(await settingsOf(id)).toEqual({ requireEmail: false });
    expect(await updatesOf(untouched)).toEqual([]);
  });

  it('changes another member’s signups only for that member', async () => {
    ship('participant', ['en', 'sv']);
    const pats = await signup();
    const sams = await signup({ organizerId: sam });

    expect(await setOpenSignupsLocale(db, samActor, 'sv')).toEqual({
      ok: true,
      value: { locale: 'sv', signupIds: [sams] },
    });
    expect((await settingsOf(pats))?.locale).toBeUndefined();
  });

  it('leaves a signup its participants already get the language in, by the same rule its pages use', async () => {
    ship('participant', ['en', 'sv']);
    const swedish = await signup({ settings: { locale: 'sv' } });
    const none = await signup({ settings: {} });
    const unknown = await signup({ settings: { locale: 'xx' } });
    const english = await signup({ settings: { locale: 'en' } });

    // With the instance in Swedish, a signup with no language of its own, or
    // one that isn't offered, is in Swedish already.
    instance.defaultLocale = 'sv';
    expect(await openSignupsToSwitch(db, patActor, 'sv')).toEqual({ ok: true, value: [english] });
    expect(await setOpenSignupsLocale(db, patActor, 'sv')).toEqual({
      ok: true,
      value: { locale: 'sv', signupIds: [english] },
    });
    expect(await settingsOf(swedish)).toEqual({ locale: 'sv' });
    expect(await settingsOf(none)).toEqual({});
    expect(await settingsOf(unknown)).toEqual({ locale: 'xx' });
    expect(await updatesOf([swedish, none, unknown])).toEqual([]);

    // Once all are in it, there's nothing to change and nothing is written.
    expect(await openSignupsToSwitch(db, patActor, 'sv')).toEqual({ ok: true, value: [] });
    expect(await setOpenSignupsLocale(db, patActor, 'sv')).toEqual({
      ok: true,
      value: { locale: 'sv', signupIds: [] },
    });
    expect(await updatesOf([english])).toHaveLength(1);
  });

  it('refuses a language that hasn’t shipped, or none, and changes nothing', async () => {
    const open = await signup({ settings: { locale: 'en' } });
    for (const sent of ['sv', 'xx', 'EN', '', null, undefined, ['en']]) {
      const result = await setOpenSignupsLocale(db, patActor, sent);
      expect(result.ok, `${JSON.stringify(sent)} was accepted`).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({ code: 'invalid_input', field: 'locale' });
      }
    }
    expect(await settingsOf(open)).toEqual({ locale: 'en' });
    expect(await updatesOf([open])).toEqual([]);
  });

  it('refuses anyone who isn’t an organizer', async () => {
    ship('participant', ['en', 'sv']);
    const open = await signup();
    const participant: Actor = {
      kind: 'participant',
      signupId: open,
      participantId: makeId('par'),
      commitmentId: makeId('com'),
    };
    for (const actor of [{ kind: 'anonymous' } as const, participant]) {
      await expect(setOpenSignupsLocale(db, actor, 'sv')).rejects.toBeInstanceOf(ServiceException);
      await expect(openSignupsToSwitch(db, actor, 'sv')).rejects.toBeInstanceOf(ServiceException);
    }
    expect((await settingsOf(open))?.locale).toBeUndefined();
  });

  it('changes nothing for an organizer who can’t change any workspace', async () => {
    ship('participant', ['en', 'sv']);
    const theirs = await signup({ workspaceId: viewed });
    const viewer: Actor = {
      ...patActor,
      workspaceIds: [viewed],
      workspaceRoles: { [viewed]: 'viewer' },
    };

    expect(await openSignupsToSwitch(db, viewer, 'sv')).toEqual({ ok: true, value: [] });
    expect(await setOpenSignupsLocale(db, viewer, 'sv')).toEqual({
      ok: true,
      value: { locale: 'sv', signupIds: [] },
    });
    expect((await settingsOf(theirs))?.locale).toBeUndefined();
  });

  it('waits for a write already under way on one of them, and leaves it out if that deleted it', async () => {
    ship('participant', ['en', 'sv']);
    const kept = await signup();
    const deleting = await signup();

    let running: Promise<unknown> | undefined;
    await db
      .transaction(async (tx) => {
        expect(await lockSignupForWrite(tx, deleting, shared)).toBeDefined();
        running = setOpenSignupsLocale(db, patActor, 'sv');
        await untilServiceBlockedOn(db, tx, running);
        await tx.update(signups).set({ deletedAt: new Date() }).where(eq(signups.id, deleting));
      })
      .finally(() => settle(running));

    expect(await running).toEqual({ ok: true, value: { locale: 'sv', signupIds: [kept] } });
    expect((await settingsOf(deleting))?.locale).toBeUndefined();
  });
});
