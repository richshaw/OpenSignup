import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { rateLimits } from '@/db/schema/rate-limits';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import { type Audience, type CatalogLocale, SHIPPED } from '@/i18n/config';
import { ServiceException } from '@/lib/errors';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { chargeRateLimit, consumeRateLimit, RateLimits } from '@/lib/rate-limit';
import { DESCRIPTION_MAX_LENGTH } from '@/schemas/signups';
import { createSignupAction, type NewSignupFormState } from './actions';

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

// The action reads the organizer from the session cookie, and their browser's
// language from the request. Tests hand it both directly instead of going
// through Auth.js and Next.
const request = vi.hoisted(() => ({
  locale: null as string | null,
  acceptLanguage: null as string | null,
  instanceDefault: undefined as string | undefined,
}));
vi.mock('@/auth/session', () => ({
  requireOrganizerSession: async () => ({
    organizerId,
    defaultWorkspaceId: workspaceId,
    locale: request.locale,
  }),
  toActor: () => owner,
}));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers(request.acceptLanguage ? { 'accept-language': request.acceptLanguage } : {}),
}));
// The environment's own parse refuses a DEFAULT_LOCALE with no catalog, and
// Swedish has none yet.
vi.mock('@/i18n/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/server')>()),
  instanceDefaultLocale: () => request.instanceDefault,
}));

// Only English has shipped today. The tests that need a choice ship Swedish by
// changing the list itself, so config.ts's own `isShipped` sees it too.
const asShippedToday = { ...SHIPPED };
function ship(audience: Audience, locales: string[]) {
  (SHIPPED as Record<Audience, readonly string[]>)[audience] = locales;
}

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

type Answer = { redirect: string } | { refused: NonNullable<NewSignupFormState> };

async function submit(title: string, description = ''): Promise<Answer> {
  const form = new FormData();
  form.set('title', title);
  form.set('description', description);
  try {
    const state = await createSignupAction(null, form);
    if (state) return { refused: state };
  } catch (e) {
    if (e instanceof Redirected) return { redirect: e.url };
    throw e;
  }
  throw new Error('the action neither redirected nor refused');
}

describe('createSignupAction (db)', () => {
  const db = getDb();
  const policy = RateLimits.signupCreatePerOrganizer;
  const bucket = and(eq(rateLimits.bucket, policy.bucket), eq(rateLimits.subject, organizerId));
  const created = async () =>
    db.select({ id: signups.id }).from(signups).where(eq(signups.workspaceId, workspaceId));

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
  });

  beforeEach(async () => {
    request.locale = null;
    request.acceptLanguage = null;
    request.instanceDefault = undefined;
    await db.delete(rateLimits).where(bucket);
    await db.delete(signups).where(eq(signups.workspaceId, workspaceId));
  });

  afterEach(() => {
    Object.assign(SHIPPED, asShippedToday);
  });

  afterAll(async () => {
    await db.delete(rateLimits).where(bucket);
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  it('creates the signup and charges the per-organizer create quota', async () => {
    const answer = await submit('Snack duty');
    const rows = await created();
    expect(rows).toHaveLength(1);
    expect(answer).toEqual({ redirect: `/app/signups/${rows[0]!.id}` });
    const [charged] = await db.select({ count: rateLimits.count }).from(rateLimits).where(bucket);
    expect(charged?.count).toBe(1);
  });

  it('refuses a title of only spaces with the Build tab’s message', async () => {
    expect(await submit('   ')).toEqual({
      refused: { error: 'Title must be at least 2 characters.', title: '   ', description: '' },
    });
    expect(await created()).toHaveLength(0);
  });

  it('hands back the title and description as typed when it refuses', async () => {
    // One letter with spaces round it passes the browser's minLength of 2,
    // then the server trims it and refuses.
    // The browser sends the line break as \r\n; the box held it as \n.
    expect(await submit(' a ', 'Bring a plate.\r\nNuts are fine.')).toEqual({
      refused: {
        error: 'Title must be at least 2 characters.',
        title: ' a ',
        description: 'Bring a plate.\nNuts are fine.',
      },
    });
    expect(await created()).toHaveLength(0);
  });

  it('saves the title trimmed', async () => {
    await submit('  Bake sale  ');
    const rows = await db
      .select({ title: signups.title })
      .from(signups)
      .where(eq(signups.workspaceId, workspaceId));
    expect(rows.map((r) => r.title)).toEqual(['Bake sale']);
  });

  it('takes a full description with line breaks, sent as \\r\\n, and saves \\n', async () => {
    // 1,996 letters and 4 line breaks fill the 2,000-character textarea. The
    // browser sends each break as \r\n, so 2,004 characters arrive.
    const sent = `${'a'.repeat(499)}\r\n`.repeat(4);
    expect(sent).toHaveLength(DESCRIPTION_MAX_LENGTH + 4);
    expect(await submit('Bake sale', sent)).toEqual({
      redirect: expect.stringMatching(/^\/app\/signups\/[^?]+$/),
    });
    const [row] = await db
      .select({ description: signups.description })
      .from(signups)
      .where(eq(signups.workspaceId, workspaceId));
    // The length limit is on the description before it's trimmed, so the full
    // 2,000 characters are taken; the trim then drops the break at the end.
    expect(row?.description).toBe(`${'a'.repeat(499)}\n`.repeat(4).trimEnd());
  });

  it('refuses a create past the limit, back on the form with a plain message', async () => {
    // Everything but the last unit of this hour's quota is already spent.
    await chargeRateLimit(db, policy, organizerId, policy.max - 1);
    expect(await submit('Last one')).toEqual({
      redirect: expect.stringMatching(/^\/app\/signups\/[^?]+$/),
    });

    const answer = await submit('One too many', 'Kept');
    if (!('refused' in answer)) throw new Error('expected a refusal');
    expect(answer.refused).toMatchObject({ title: 'One too many', description: 'Kept' });
    expect(answer.refused.error).toMatch(
      /^You’ve created a lot of signups in the last hour\. Try again in about \d+ minutes?\.$/,
    );
    expect(await created()).toHaveLength(1);
  });

  it('shares its bucket with POST /api/signups', async () => {
    // The form fills the quota; the route's own charge is then refused.
    await chargeRateLimit(db, policy, organizerId, policy.max - 1);
    await submit('Fills the quota');
    await expect(consumeRateLimit(db, policy, organizerId)).rejects.toSatisfy(
      (e) => e instanceof ServiceException && e.serviceError.code === 'rate_limited',
    );

    // And the other way round: spent by the route, refused on the form.
    await db.delete(rateLimits).where(bucket);
    await chargeRateLimit(db, policy, organizerId, policy.max);
    expect(await submit('Refused')).toHaveProperty('refused');
  });

  /** The one signup the form made: its settings and its signup.created payload. */
  async function madeOne() {
    const [row] = await db
      .select({ id: signups.id, settings: signups.settings })
      .from(signups)
      .where(eq(signups.workspaceId, workspaceId));
    if (!row) throw new Error('no signup was made');
    const [created] = await db
      .select({ payload: activity.payload })
      .from(activity)
      .where(and(eq(activity.signupId, row.id), eq(activity.eventType, 'signup.created')));
    return {
      settings: row.settings as Record<string, unknown>,
      telemetry: created?.payload as Record<string, unknown>,
    };
  }

  it('stores no language, and records none, while only English has shipped', async () => {
    request.locale = 'en';
    request.acceptLanguage = 'en-GB';
    await submit('English only');
    const { settings, telemetry } = await madeOne();
    expect(settings).not.toHaveProperty('locale');
    expect(telemetry).not.toHaveProperty('locale');
    expect(telemetry).not.toHaveProperty('localeSource');
  });

  describe('once Swedish has shipped to participants', () => {
    beforeEach(() => {
      ship('participant', ['en', 'sv' as CatalogLocale]);
    });

    it.each([
      { step: 'setting', locale: 'sv', instanceDefault: 'en', acceptLanguage: 'en' },
      { step: 'instance', locale: null, instanceDefault: 'sv', acceptLanguage: 'en' },
      { step: 'browser', locale: null, instanceDefault: undefined, acceptLanguage: 'sv-SE,en' },
    ])(
      'starts the signup in the organizer’s language, chosen by their $step',
      async ({ step, ...given }) => {
        Object.assign(request, given);
        await submit('In Swedish');
        const { settings, telemetry } = await madeOne();
        expect(settings).toMatchObject({ locale: 'sv' });
        expect(telemetry).toMatchObject({ locale: 'sv', localeSource: step });
      },
    );

    it('starts it in English when no step names a shipped language', async () => {
      request.acceptLanguage = 'de';
      await submit('In English');
      const { settings, telemetry } = await madeOne();
      expect(settings).toMatchObject({ locale: 'en' });
      expect(telemetry).toMatchObject({ locale: 'en', localeSource: 'default' });
    });
  });
});
