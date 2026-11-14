import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import { ship } from '@/i18n/testing/ship';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { setOpenSignupsLocaleAction, setOrganizerLocaleAction } from './actions';

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

/** Sends the form as the page does, with `fields` in it, and says where the action went. */
async function submit(
  fields: Record<string, string>,
  action: (form: FormData) => Promise<void> = setOrganizerLocaleAction,
): Promise<string> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  try {
    await action(form);
  } catch (e) {
    if (e instanceof Redirected) return e.url;
    throw e;
  }
  throw new Error('the action did not redirect');
}

const SAVED = '/app/settings?saved=language';
const REFUSED = '/app/settings?error=invalid_input';

describe('setOrganizerLocaleAction (db)', () => {
  const db = getDb();
  const mine = makeId('org');
  const theirs = makeId('org');
  const organizer = (id: string): Actor => ({
    kind: 'organizer',
    id,
    email: `${id.toLowerCase()}@example.com`,
    workspaceIds: [],
    workspaceRoles: {},
  });
  const stored = async (id: string) => {
    const [row] = await db
      .select({ locale: organizers.locale })
      .from(organizers)
      .where(eq(organizers.id, id));
    return row?.locale;
  };

  beforeAll(async () => {
    await db.insert(organizers).values([
      { id: mine, email: `${mine.toLowerCase()}@example.com` },
      { id: theirs, email: `${theirs.toLowerCase()}@example.com` },
    ]);
  });

  afterAll(async () => {
    await db.delete(organizers).where(inArray(organizers.id, [mine, theirs]));
  });

  beforeEach(() => {
    revalidatePath.mockClear();
    session.actor = organizer(mine);
  });

  afterEach(async () => {
    await db
      .update(organizers)
      .set({ locale: null })
      .where(inArray(organizers.id, [mine, theirs]));
  });

  it('saves a shipped language on the signed-in organizer and comes back saying so', async () => {
    expect(await submit({ locale: 'en' })).toBe(SAVED);
    expect(await stored(mine)).toBe('en');
    expect(revalidatePath).toHaveBeenCalledWith('/app/settings');

    ship('participant', ['en', 'sv']);
    expect(await submit({ locale: 'sv' })).toBe(SAVED);
    expect(await stored(mine)).toBe('sv');
  });

  it('saves on the signed-in organizer only, whoever the form names', async () => {
    await db.update(organizers).set({ locale: 'en' }).where(eq(organizers.id, theirs));
    ship('participant', ['en', 'sv']);

    expect(await submit({ locale: 'sv', organizerId: theirs, id: theirs, organizer: theirs })).toBe(
      SAVED,
    );
    expect(await stored(mine)).toBe('sv');
    expect(await stored(theirs)).toBe('en');
  });

  it('refuses a language that hasn’t shipped, an empty one or none, and keeps the stored one', async () => {
    await submit({ locale: 'en' });
    revalidatePath.mockClear();

    const forms: Record<string, string>[] = [
      { locale: 'sv' },
      { locale: 'xx' },
      { locale: '' },
      {},
    ];
    for (const fields of forms) {
      expect(await submit(fields)).toBe(REFUSED);
    }
    expect(await stored(mine)).toBe('en');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('setOpenSignupsLocaleAction (db)', () => {
  const db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const owner: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${organizerId.toLowerCase()}@example.com`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  const ids: Record<'open' | 'draft' | 'closed', string> = {
    open: makeId('sig'),
    draft: makeId('sig'),
    closed: makeId('sig'),
  };
  const localeOf = async (id: string) => {
    const [row] = await db
      .select({ settings: signups.settings })
      .from(signups)
      .where(eq(signups.id, id));
    return row?.settings.locale;
  };

  beforeAll(async () => {
    await db.insert(organizers).values({ id: organizerId, email: owner.email });
    await db.insert(workspaces).values({
      id: workspaceId,
      slug: `test-${workspaceId.slice(-8).toLowerCase()}`,
      name: 'Test Workspace',
      type: 'personal',
      plan: 'free',
    });
    await db.insert(signups).values(
      Object.entries(ids).map(([status, id]) => ({
        id,
        workspaceId,
        organizerId,
        slug: `test-${id.slice(-10).toLowerCase()}`,
        title: 'Bake sale',
        status,
        settings: { locale: 'en' },
      })),
    );
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  beforeEach(() => {
    revalidatePath.mockClear();
    session.actor = owner;
  });

  it('puts the organizer’s open signups in the language and comes back saying so', async () => {
    ship('participant', ['en', 'sv']);
    expect(await submit({ locale: 'sv' }, setOpenSignupsLocaleAction)).toBe(
      '/app/settings?saved=open-signups',
    );
    expect(await localeOf(ids.open)).toBe('sv');
    expect(await localeOf(ids.draft)).toBe('en');
    expect(await localeOf(ids.closed)).toBe('en');
    // The signup it changed shows its new language on its own tabs.
    expect(revalidatePath).toHaveBeenCalledWith(`/app/signups/${ids.open}`, 'layout');
    expect(revalidatePath).not.toHaveBeenCalledWith(`/app/signups/${ids.draft}`, 'layout');
    const updates = await db
      .select({ payload: activity.payload })
      .from(activity)
      .where(and(eq(activity.signupId, ids.open), eq(activity.eventType, 'signup.updated')));
    expect(updates).toEqual([{ payload: { changed: ['settings'] } }]);
  });

  it('refuses a language that hasn’t shipped, or none, and changes nothing', async () => {
    const before = await localeOf(ids.open);
    const forms: Record<string, string>[] = [
      { locale: 'sv' },
      { locale: 'xx' },
      { locale: '' },
      {},
    ];
    for (const fields of forms) {
      expect(await submit(fields, setOpenSignupsLocaleAction)).toBe(REFUSED);
    }
    expect(await localeOf(ids.open)).toBe(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
