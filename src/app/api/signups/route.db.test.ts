import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { rateLimits } from '@/db/schema/rate-limits';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import type { CatalogLocale } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { RateLimits } from '@/lib/rate-limit';
import { POST } from './route';

// The session is stubbed; the route, policy, rate limit and database are real.
const route = vi.hoisted(() => ({
  actor: undefined as unknown,
  defaultWorkspaceId: '',
  locale: null as string | null,
  instanceDefault: undefined as string | undefined,
}));
vi.mock('@/auth/session', () => ({
  requireActor: async () => route.actor,
  getOrganizerSession: async () => ({
    defaultWorkspaceId: route.defaultWorkspaceId,
    locale: route.locale,
  }),
}));
// The environment's own parse refuses a DEFAULT_LOCALE with no catalog, and
// Swedish has none yet.
vi.mock('@/i18n/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n/server')>()),
  instanceDefaultLocale: () => route.instanceDefault,
}));

// Swedish has no catalog yet, hence the cast.
const SV = 'sv' as CatalogLocale;

const BUCKET = RateLimits.signupCreatePerOrganizer.bucket;

describe('POST /api/signups create quota (db)', () => {
  const db: Db = getDb();
  const ownerId = makeId('org');
  const callerId = makeId('org');
  const sharedWs = makeId('ws');
  const callerWs = makeId('ws');
  const foreignWs = makeId('ws');
  const caller: Actor = {
    kind: 'organizer',
    id: callerId,
    email: 'pat@example.com',
    workspaceIds: [callerWs, sharedWs],
    workspaceRoles: { [callerWs]: 'owner', [sharedWs]: 'viewer' },
  };

  beforeAll(async () => {
    await db.transaction(async (tx) => {
      await tx.insert(organizers).values([
        { id: ownerId, email: `${ownerId.toLowerCase()}@example.test`, name: 'Owner' },
        { id: callerId, email: `${callerId.toLowerCase()}@example.test`, name: 'Pat' },
      ]);
      await tx.insert(workspaces).values(
        [sharedWs, callerWs, foreignWs].map((id) => ({
          id,
          slug: `quota-${id.slice(-10).toLowerCase()}`,
          name: 'Quota test',
          type: 'personal' as const,
          plan: 'free' as const,
        })),
      );
      await tx.insert(workspaceMembers).values([
        {
          id: makeId('mem'),
          workspaceId: sharedWs,
          organizerId: ownerId,
          role: 'owner',
          status: 'active',
        },
        {
          id: makeId('mem'),
          workspaceId: foreignWs,
          organizerId: ownerId,
          role: 'owner',
          status: 'active',
        },
        {
          id: makeId('mem'),
          workspaceId: sharedWs,
          organizerId: callerId,
          role: 'viewer',
          status: 'active',
        },
        {
          id: makeId('mem'),
          workspaceId: callerWs,
          organizerId: callerId,
          role: 'owner',
          status: 'active',
        },
      ]);
    });
  });

  beforeEach(() => {
    route.actor = caller;
    route.defaultWorkspaceId = callerWs;
  });

  afterAll(async () => {
    await db.delete(rateLimits).where(eq(rateLimits.subject, callerId));
    await db.delete(workspaces).where(inArray(workspaces.id, [sharedWs, callerWs, foreignWs]));
    await db.delete(organizers).where(inArray(organizers.id, [ownerId, callerId]));
  });

  async function charged(): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`coalesce(sum(${rateLimits.count}), 0)::int` })
      .from(rateLimits)
      .where(and(eq(rateLimits.bucket, BUCKET), eq(rateLimits.subject, callerId)));
    return row?.n ?? 0;
  }

  function create(body: Record<string, unknown>) {
    return POST(
      new NextRequest('http://localhost/api/signups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Snack duty', ...body }),
      }),
      { params: Promise.resolve({}) },
    );
  }

  it('refuses a viewer of the workspace without charging the create quota', async () => {
    const before = await charged();
    const res = await create({ workspaceId: sharedWs });
    expect(res.status).toBe(403);
    expect(await charged()).toBe(before);
  });

  it('refuses a workspace the caller does not belong to without charging the create quota', async () => {
    const before = await charged();
    const res = await create({ workspaceId: foreignWs });
    expect(res.status).toBe(403);
    expect(await charged()).toBe(before);
  });

  it('charges one unit for a create that succeeds', async () => {
    const before = await charged();
    const res = await create({});
    expect(res.status).toBe(200);
    expect(await charged()).toBe(before + 1);
  });
});

describe('POST /api/signups chooses the new signup’s language (db)', () => {
  const db: Db = getDb();
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  const organizer: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: 'pat@example.com',
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };

  beforeAll(async () => {
    await db.transaction(async (tx) => {
      await tx
        .insert(organizers)
        .values({ id: organizerId, email: `${organizerId.toLowerCase()}@example.test` });
      await tx.insert(workspaces).values({
        id: workspaceId,
        slug: `locale-${workspaceId.slice(-10).toLowerCase()}`,
        name: 'Language test',
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
    route.actor = organizer;
    route.defaultWorkspaceId = workspaceId;
    route.locale = null;
    route.instanceDefault = undefined;
    await db.delete(rateLimits).where(eq(rateLimits.subject, organizerId));
  });

  afterAll(async () => {
    await db.delete(rateLimits).where(eq(rateLimits.subject, organizerId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  async function create(body: Record<string, unknown>, acceptLanguage?: string) {
    const res = await POST(
      new NextRequest('http://localhost/api/signups', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(acceptLanguage ? { 'accept-language': acceptLanguage } : {}),
        },
        body: JSON.stringify({ title: 'Snack duty', ...body }),
      }),
      { params: Promise.resolve({}) },
    );
    const json = (await res.json()) as {
      data?: { id: string; settings: Record<string, unknown> };
      error?: { code: string; field?: string };
    };
    if (!json.data) return { status: res.status, error: json.error };
    const [created] = await db
      .select({ payload: activity.payload })
      .from(activity)
      .where(and(eq(activity.signupId, json.data.id), eq(activity.eventType, 'signup.created')));
    return {
      status: res.status,
      settings: json.data.settings,
      telemetry: created?.payload as Record<string, unknown>,
    };
  }

  async function made(title: string) {
    return db
      .select({ id: signups.id })
      .from(signups)
      .where(and(eq(signups.workspaceId, workspaceId), eq(signups.title, title)));
  }

  describe('while only English has shipped', () => {
    it('stores no language, and records none, whatever the organizer’s steps say', async () => {
      route.locale = 'en';
      route.instanceDefault = 'en';
      const r = await create({}, 'en-GB');
      expect(r.status).toBe(200);
      expect(r.settings).not.toHaveProperty('locale');
      expect(r.telemetry).not.toHaveProperty('locale');
      expect(r.telemetry).not.toHaveProperty('localeSource');
    });

    it('stores a shipped language the caller sent, as the caller’s', async () => {
      const r = await create({ settings: { locale: 'en' } });
      expect(r.status).toBe(200);
      expect(r.settings).toMatchObject({ locale: 'en' });
      expect(r.telemetry).toMatchObject({ locale: 'en', localeSource: 'api' });
    });

    it('refuses a language the caller sent that hasn’t shipped, and makes nothing', async () => {
      const r = await create({ title: 'Unshipped', settings: { locale: 'sv' } });
      expect(r.status).toBe(400);
      expect(r.error).toMatchObject({ code: 'invalid_input', field: 'settings.locale' });
      expect(await made('Unshipped')).toEqual([]);
    });
  });

  describe('once Swedish has shipped to participants', () => {
    beforeEach(() => {
      ship('participant', ['en', SV]);
    });

    it('takes the organizer’s saved language first', async () => {
      route.locale = 'sv';
      route.instanceDefault = 'en';
      const r = await create({}, 'en');
      expect(r.settings).toMatchObject({ locale: 'sv' });
      expect(r.telemetry).toMatchObject({ locale: 'sv', localeSource: 'setting' });
    });

    it('takes the instance’s DEFAULT_LOCALE before the browser', async () => {
      route.instanceDefault = 'sv';
      const r = await create({}, 'en');
      expect(r.settings).toMatchObject({ locale: 'sv' });
      expect(r.telemetry).toMatchObject({ locale: 'sv', localeSource: 'instance' });
    });

    it('takes the browser’s top language next', async () => {
      const r = await create({}, 'sv-SE,en;q=0.8');
      expect(r.settings).toMatchObject({ locale: 'sv' });
      expect(r.telemetry).toMatchObject({ locale: 'sv', localeSource: 'browser' });
    });

    it('falls back to English when no step names a shipped language', async () => {
      route.locale = 'xx';
      const r = await create({}, 'de');
      expect(r.settings).toMatchObject({ locale: 'en' });
      expect(r.telemetry).toMatchObject({ locale: 'en', localeSource: 'default' });
    });

    it('keeps the caller’s language over the organizer’s', async () => {
      route.locale = 'sv';
      const r = await create({ settings: { locale: 'en' } }, 'sv');
      expect(r.settings).toMatchObject({ locale: 'en' });
      expect(r.telemetry).toMatchObject({ locale: 'en', localeSource: 'api' });
      const sent = await create({ settings: { locale: 'sv' } });
      expect(sent.settings).toMatchObject({ locale: 'sv' });
      expect(sent.telemetry).toMatchObject({ locale: 'sv', localeSource: 'api' });
    });

    it('still refuses a sent language that hasn’t shipped, rather than choosing one', async () => {
      route.locale = 'sv';
      for (const locale of ['xx', null, '']) {
        const title = `Refused ${String(locale)}`;
        const r = await create({ title, settings: { locale } });
        expect(r.status).toBe(400);
        expect(r.error).toMatchObject({ code: 'invalid_input', field: 'settings.locale' });
        expect(await made(title)).toEqual([]);
      }
    });

    it('adds the language to the other settings sent', async () => {
      route.locale = 'sv';
      const r = await create({ settings: { sendReminders: false } });
      expect(r.settings).toMatchObject({ sendReminders: false, locale: 'sv' });
    });

    it('leaves settings that aren’t an object for the service to refuse', async () => {
      route.locale = 'sv';
      const r = await create({ title: 'Bad settings', settings: 'sv' });
      expect(r.status).toBe(400);
      expect(r.error).toMatchObject({ code: 'invalid_input' });
      expect(await made('Bad settings')).toEqual([]);
    });
  });
});
