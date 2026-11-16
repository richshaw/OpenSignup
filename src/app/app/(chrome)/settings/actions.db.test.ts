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
import { setOrganizerLocaleAction, switchOpenSignupsLocaleAction } from './actions';

// The action reads the organizer from the session cookie. Tests hand it one
// directly instead of going through Auth.js, with the language they saved.
const session = vi.hoisted(() => ({
  actor: { kind: 'anonymous' } as Actor,
  locale: null as string | null,
}));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({ locale: session.locale }),
  toActor: () => session.actor,
}));
// No browser language: the organizer's is the one they saved, else English.
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

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
async function submit(fields: Record<string, string>): Promise<string> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  try {
    await setOrganizerLocaleAction(form);
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

describe('switchOpenSignupsLocaleAction (db)', () => {
  const db = getDb();
  const organizerId = makeId('org');
  const otherId = makeId('org');
  const workspaceId = makeId('ws');
  const owner: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: `${organizerId.toLowerCase()}@example.com`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  // The organizer's open signups, one in English and one with no language of
  // its own; their draft and closed one; and another member's open one.
  const ids = {
    english: makeId('sig'),
    none: makeId('sig'),
    draft: makeId('sig'),
    closed: makeId('sig'),
    theirs: makeId('sig'),
  };
  const rows = [
    { id: ids.english, status: 'open', settings: { locale: 'en' } },
    { id: ids.none, status: 'open', settings: {} },
    { id: ids.draft, status: 'draft', settings: { locale: 'en' } },
    { id: ids.closed, status: 'closed', settings: { locale: 'en' } },
    { id: ids.theirs, status: 'open', settings: { locale: 'en' }, organizerId: otherId },
  ];
  const localeOf = async (id: string) => {
    const [row] = await db
      .select({ settings: signups.settings })
      .from(signups)
      .where(eq(signups.id, id));
    return row?.settings.locale;
  };
  /** Presses the button, whose form sends `fields` (none, as the page's), and says where the action went. */
  const press = async (fields: Record<string, string> = {}) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    try {
      await switchOpenSignupsLocaleAction(form);
    } catch (e) {
      if (e instanceof Redirected) return e.url;
      throw e;
    }
    return 'stayed';
  };

  beforeAll(async () => {
    await db.insert(organizers).values([
      { id: organizerId, email: owner.email },
      { id: otherId, email: `${otherId.toLowerCase()}@example.com` },
    ]);
    await db.insert(workspaces).values({
      id: workspaceId,
      slug: `test-${workspaceId.slice(-8).toLowerCase()}`,
      name: 'Test Workspace',
      type: 'team',
      plan: 'free',
    });
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(inArray(organizers.id, [organizerId, otherId]));
  });

  beforeEach(async () => {
    revalidatePath.mockClear();
    session.actor = owner;
    session.locale = 'sv';
    await db.delete(signups).where(inArray(signups.id, Object.values(ids)));
    await db.insert(signups).values(
      rows.map(({ id, status, settings, organizerId: madeBy = organizerId }) => ({
        id,
        workspaceId,
        organizerId: madeBy,
        slug: `test-${id.slice(-10).toLowerCase()}`,
        title: 'Bake sale',
        status,
        settings,
      })),
    );
  });

  it('puts the organizer’s open signups in their language and comes back saying so', async () => {
    ship('participant', ['en', 'sv']);
    expect(await press()).toBe('/app/settings?switched=1');
    expect(await localeOf(ids.english)).toBe('sv');
    expect(await localeOf(ids.none)).toBe('sv');
    for (const id of [ids.draft, ids.closed, ids.theirs]) expect(await localeOf(id)).toBe('en');
    // The signups it changed show their new language on their own tabs.
    expect(revalidatePath).toHaveBeenCalledWith(`/app/signups/${ids.english}`, 'layout');
    expect(revalidatePath).toHaveBeenCalledWith(`/app/signups/${ids.none}`, 'layout');
    expect(revalidatePath).not.toHaveBeenCalledWith(`/app/signups/${ids.draft}`, 'layout');
    expect(revalidatePath).toHaveBeenCalledWith('/app/settings');
    const updates = await db
      .select({ signupId: activity.signupId, payload: activity.payload })
      .from(activity)
      .where(
        and(
          inArray(activity.signupId, Object.values(ids)),
          eq(activity.eventType, 'signup.updated'),
        ),
      );
    expect(updates).toHaveLength(2);
    for (const row of updates) expect(row.payload).toEqual({ changed: ['settings'] });
  });

  it('changes nothing more on a second press, and stays where it is', async () => {
    ship('participant', ['en', 'sv']);
    expect(await press()).toBe('/app/settings?switched=1');
    revalidatePath.mockClear();

    // A double tap's second press, which waits for the first.
    expect(await press()).toBe('stayed');
    expect(revalidatePath).toHaveBeenCalledWith('/app/settings');
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    for (const id of [ids.draft, ids.closed, ids.theirs]) expect(await localeOf(id)).toBe('en');
  });

  it('uses the organizer’s own language, whatever a forged form names', async () => {
    ship('participant', ['en', 'sv']);
    // The organizer's language is English, and one open signup is Swedish.
    session.locale = 'en';
    await db
      .update(signups)
      .set({ settings: { locale: 'sv' } })
      .where(eq(signups.id, ids.english));
    expect(
      await press({ locale: 'sv', organizerId: otherId, signupId: ids.theirs, id: ids.draft }),
    ).toBe('/app/settings?switched=1');
    // That one went to English, the organizer's; Swedish, the form's, went
    // nowhere, and nobody else's signup moved.
    expect(await localeOf(ids.english)).toBe('en');
    for (const id of Object.values(ids)) expect(await localeOf(id)).not.toBe('sv');
  });

  it('refuses anyone signed out, by its code', async () => {
    ship('participant', ['en', 'sv']);
    session.actor = { kind: 'anonymous' };
    expect(await press()).toBe('/app/settings?error=unauthorized');
    expect(await localeOf(ids.english)).toBe('en');
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
