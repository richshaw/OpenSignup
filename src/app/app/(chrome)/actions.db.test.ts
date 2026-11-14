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
import { openSignupsToSwitch } from '@/services/signups';
import { settle, untilServiceBlockedOn } from '@/services/testing/locks';
import { setOpenSignupsLocaleAction } from './settings/actions';
import { answerSwedishNoticeAction } from './actions';

// The actions read the organizer from the session cookie. Tests hand them one
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

/** Sends a form with `fields` in it, as a button on the page does, and says where the action went. */
async function submit(
  fields: Record<string, string>,
  action: (form: FormData) => Promise<void> = answerSwedishNoticeAction,
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

describe('answerSwedishNoticeAction (db)', () => {
  const db = getDb();
  const mine = makeId('org');
  const theirs = makeId('org');
  const workspaceId = makeId('ws');
  const me: Actor = {
    kind: 'organizer',
    id: mine,
    email: `${mine.toLowerCase()}@example.com`,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  const open = makeId('sig');
  const draft = makeId('sig');

  const stored = async (id: string) => {
    const [row] = await db
      .select({ locale: organizers.locale })
      .from(organizers)
      .where(eq(organizers.id, id));
    return row?.locale;
  };
  const answers = async (id: string) =>
    db
      .select()
      .from(activity)
      .where(and(eq(activity.actorId, id), eq(activity.eventType, 'language_notice.answered')));
  const localeOf = async (id: string) => {
    const [row] = await db
      .select({ settings: signups.settings })
      .from(signups)
      .where(eq(signups.id, id));
    return row?.settings.locale;
  };

  beforeAll(async () => {
    await db.insert(organizers).values([
      { id: mine, email: me.email },
      { id: theirs, email: `${theirs.toLowerCase()}@example.com` },
    ]);
    await db.insert(workspaces).values({
      id: workspaceId,
      slug: `test-${workspaceId.slice(-8).toLowerCase()}`,
      name: 'Test Workspace',
      type: 'personal',
      plan: 'free',
    });
    // Made before Swedish shipped, so neither has a language of its own.
    await db.insert(signups).values(
      [
        { id: open, status: 'open' },
        { id: draft, status: 'draft' },
      ].map(({ id, status }) => ({
        id,
        workspaceId,
        organizerId: mine,
        slug: `test-${id.slice(-10).toLowerCase()}`,
        title: 'Kakor till fikat',
        status,
      })),
    );
  });

  afterAll(async () => {
    await db.delete(activity).where(inArray(activity.actorId, [mine, theirs]));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(inArray(organizers.id, [mine, theirs]));
  });

  beforeEach(() => {
    revalidatePath.mockClear();
    session.actor = me;
  });

  afterEach(async () => {
    await db
      .update(organizers)
      .set({ locale: null })
      .where(inArray(organizers.id, [mine, theirs]));
    await db
      .update(signups)
      .set({ settings: {} })
      .where(inArray(signups.id, [open, draft]));
    await db.delete(activity).where(inArray(activity.actorId, [mine, theirs]));
  });

  it('Use Swedish saves Swedish, records the answer, and goes on to account Settings', async () => {
    ship('participant', ['en', 'sv']);
    expect(await submit({ locale: 'sv' })).toBe('/app/settings?saved=language');
    expect(await stored(mine)).toBe('sv');
    const rows = await answers(mine);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorType: 'organizer',
      signupId: null,
      workspaceId: null,
      payload: { locale: 'sv' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/app');
    expect(revalidatePath).toHaveBeenCalledWith('/app/settings');
  });

  it('Keep English saves English, records the answer, and comes back to Your signups', async () => {
    ship('participant', ['en', 'sv']);
    expect(await submit({ locale: 'en' })).toBe('/app');
    expect(await stored(mine)).toBe('en');
    expect((await answers(mine)).map((row) => row.payload)).toEqual([{ locale: 'en' }]);
    expect(revalidatePath).toHaveBeenCalledWith('/app');
  });

  it('records only the first answer: a second click or a stale form saves again but records nothing', async () => {
    ship('participant', ['en', 'sv']);
    expect(await submit({ locale: 'en' })).toBe('/app');
    expect(await submit({ locale: 'en' })).toBe('/app');
    // A notice left open in another tab, answered the other way.
    expect(await submit({ locale: 'sv' })).toBe('/app/settings?saved=language');
    expect(await stored(mine)).toBe('sv');
    expect((await answers(mine)).map((row) => row.payload)).toEqual([{ locale: 'en' }]);
  });

  it('records one answer for two sent at once, as a double click sends them', async () => {
    ship('participant', ['en', 'sv']);
    expect(await Promise.all([submit({ locale: 'en' }), submit({ locale: 'en' })])).toEqual([
      '/app',
      '/app',
    ]);
    expect(await stored(mine)).toBe('en');
    expect(await answers(mine)).toHaveLength(1);
  });

  it('waits for an answer already being saved, and then records nothing', async () => {
    ship('participant', ['en', 'sv']);
    let running: Promise<string> | undefined;
    await db
      .transaction(async (tx) => {
        // The first of two answers, mid-save: it holds the organizer's row.
        await tx.select().from(organizers).where(eq(organizers.id, mine)).for('update');
        running = submit({ locale: 'sv' });
        await untilServiceBlockedOn(db, tx, running);
        await tx.update(organizers).set({ locale: 'en' }).where(eq(organizers.id, mine));
      })
      .finally(() => settle(running));

    expect(await running).toBe('/app/settings?saved=language');
    expect(await stored(mine)).toBe('sv');
    expect(await answers(mine)).toEqual([]);
  });

  it('records nothing for an organizer who had already chosen a language', async () => {
    ship('participant', ['en', 'sv']);
    await db.update(organizers).set({ locale: 'en' }).where(eq(organizers.id, mine));
    expect(await submit({ locale: 'sv' })).toBe('/app/settings?saved=language');
    expect(await stored(mine)).toBe('sv');
    expect(await answers(mine)).toEqual([]);
  });

  it('after Use Swedish, account Settings has open signups to offer, and its Yes switches them', async () => {
    ship('participant', ['en', 'sv']);
    expect(await submit({ locale: 'sv' })).toBe('/app/settings?saved=language');
    // What the Settings page reads to decide to ask "Use Svenska for your
    // open signups too?" after `saved=language`: the open one, not the draft.
    const toSwitch = await openSignupsToSwitch(db, me, 'sv');
    expect(toSwitch).toEqual({ ok: true, value: [open] });

    expect(await submit({ locale: 'sv' }, setOpenSignupsLocaleAction)).toBe(
      '/app/settings?saved=open-signups',
    );
    expect(await localeOf(open)).toBe('sv');
    expect(await localeOf(draft)).toBeUndefined();
  });

  it('saves on the signed-in organizer only, whoever the form names', async () => {
    ship('participant', ['en', 'sv']);
    await db.update(organizers).set({ locale: 'en' }).where(eq(organizers.id, theirs));
    expect(await submit({ locale: 'sv', organizerId: theirs, id: theirs, actorId: theirs })).toBe(
      '/app/settings?saved=language',
    );
    expect(await stored(mine)).toBe('sv');
    expect(await stored(theirs)).toBe('en');
    expect(await answers(theirs)).toEqual([]);
  });

  it('refuses a language that hasn’t shipped, an empty one or none, and records nothing', async () => {
    // Swedish hasn't shipped here, so Use Swedish is refused like any other.
    const forms: Record<string, string>[] = [
      { locale: 'sv' },
      { locale: 'xx' },
      { locale: '' },
      {},
    ];
    for (const fields of forms) {
      expect(await submit(fields)).toBe('/app/settings?error=invalid_input');
    }
    ship('participant', ['en', 'sv']);
    expect(await submit({ locale: 'de' })).toBe('/app/settings?error=invalid_input');
    expect(await stored(mine)).toBeNull();
    expect(await answers(mine)).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses anyone who isn’t an organizer, before any write', async () => {
    ship('participant', ['en', 'sv']);
    session.actor = { kind: 'anonymous' };
    expect(await submit({ locale: 'sv' })).toBe('/app/settings?error=unauthorized');
    expect(await stored(mine)).toBeNull();
    expect(await answers(mine)).toEqual([]);
  });
});
