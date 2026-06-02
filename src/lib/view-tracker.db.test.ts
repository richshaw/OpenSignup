import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { activity } from '@/db/schema/activity';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import {
  recordEditLinkFollowed,
  recordLandingCtaClicked,
  recordLandingView,
  recordOrganizerView,
  recordPublicView,
  type RequestSignals,
} from './view-tracker';

const realBrowserUa =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function browserSignals(overrides: Partial<RequestSignals> = {}): RequestSignals {
  return {
    userAgent: realBrowserUa,
    referer: null,
    dnt: false,
    ...overrides,
  };
}

describe('view-tracker (db)', () => {
  let db: Db;
  let workspaceId: string;
  let organizerId: string;
  let signupId: string;

  beforeAll(async () => {
    db = getDb();
    organizerId = makeId('org');
    workspaceId = makeId('ws');
    signupId = makeId('sig');
    const memberId = makeId('mem');
    const slug = `vt-${workspaceId.slice(-8).toLowerCase()}`;

    await db.transaction(async (tx) => {
      await tx
        .insert(organizers)
        .values({ id: organizerId, email: `${slug}@example.test`, name: 'View Tracker Test' });
      await tx.insert(workspaces).values({
        id: workspaceId,
        slug,
        name: 'View Tracker WS',
        type: 'personal',
        plan: 'free',
      });
      await tx.insert(workspaceMembers).values({
        id: memberId,
        workspaceId,
        organizerId,
        role: 'owner',
        status: 'active',
      });
      await tx.insert(signups).values({
        id: signupId,
        workspaceId,
        organizerId,
        slug: `s-${signupId.slice(-8).toLowerCase()}`,
        title: 'View Tracker signup',
        status: 'open',
      });
    });
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(organizers).where(eq(organizers.id, organizerId));
  });

  beforeEach(async () => {
    await db.delete(activity).where(eq(activity.signupId, signupId));
  });

  describe('recordPublicView', () => {
    it('writes a signup.viewed row for a real browser UA', async () => {
      await recordPublicView({
        signupId,
        workspaceId,
        signupStatus: 'open',
        isReturning: false,
        signals: browserSignals({ referer: 'https://news.ycombinator.com/' }),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(
          and(eq(activity.signupId, signupId), eq(activity.eventType, 'signup.viewed')),
        );
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.actorType).toBe('system');
      expect(row.actorId).toBeNull();
      expect(row.workspaceId).toBe(workspaceId);
      const payload = row.payload as Record<string, unknown>;
      expect(payload.uaClass).toBe('browser');
      expect(payload.refererHost).toBe('news.ycombinator.com');
      expect(payload.isReturning).toBe(false);
      expect(payload.signupStatus).toBe('open');
    });

    it('records isReturning=true when passed', async () => {
      await recordPublicView({
        signupId,
        workspaceId,
        signupStatus: 'open',
        isReturning: true,
        signals: browserSignals(),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(
          and(eq(activity.signupId, signupId), eq(activity.eventType, 'signup.viewed')),
        );
      expect(rows).toHaveLength(1);
      expect((rows[0]!.payload as Record<string, unknown>).isReturning).toBe(true);
    });

    it('does not write when DNT is set', async () => {
      await recordPublicView({
        signupId,
        workspaceId,
        signupStatus: 'open',
        isReturning: false,
        signals: browserSignals({ dnt: true }),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.signupId, signupId));
      expect(rows).toHaveLength(0);
    });

    it('does not write for a Googlebot UA', async () => {
      await recordPublicView({
        signupId,
        workspaceId,
        signupStatus: 'open',
        isReturning: false,
        signals: browserSignals({
          userAgent:
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        }),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.signupId, signupId));
      expect(rows).toHaveLength(0);
    });

    it('writes when UA is missing (uaClass=unknown)', async () => {
      await recordPublicView({
        signupId,
        workspaceId,
        signupStatus: 'closed',
        isReturning: false,
        signals: { userAgent: null, referer: null, dnt: false },
      });
      const rows = await db
        .select()
        .from(activity)
        .where(
          and(eq(activity.signupId, signupId), eq(activity.eventType, 'signup.viewed')),
        );
      expect(rows).toHaveLength(1);
      const payload = rows[0]!.payload as Record<string, unknown>;
      expect(payload.uaClass).toBe('unknown');
      expect(payload.signupStatus).toBe('closed');
      expect(payload.refererHost).toBeNull();
    });
  });

  describe('recordEditLinkFollowed', () => {
    it('writes a row with participant actor', async () => {
      const participantId = makeId('par');
      const commitmentId = makeId('com');
      await recordEditLinkFollowed({
        signupId,
        workspaceId,
        commitmentId,
        participantId,
        signals: browserSignals(),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(
          and(
            eq(activity.signupId, signupId),
            eq(activity.eventType, 'commitment.edit_link_followed'),
          ),
        );
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.actorType).toBe('participant');
      expect(row.actorId).toBe(participantId);
      expect((row.payload as Record<string, unknown>).commitmentId).toBe(commitmentId);
    });

    it('skips when DNT is set', async () => {
      await recordEditLinkFollowed({
        signupId,
        workspaceId,
        commitmentId: makeId('com'),
        participantId: makeId('par'),
        signals: browserSignals({ dnt: true }),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.signupId, signupId));
      expect(rows).toHaveLength(0);
    });
  });

  describe('recordLandingView', () => {
    // Landing rows have NULL signup_id/workspace_id, so the per-test cleanup
    // above (scoped to signupId) won't clear them. Wipe by event_type here;
    // db tests run sequentially (fileParallelism: false) so this is safe.
    beforeEach(async () => {
      await db.delete(activity).where(eq(activity.eventType, 'landing.viewed'));
    });

    it('writes a landing.viewed row with NULL signup/workspace for a browser UA', async () => {
      await recordLandingView({
        signals: browserSignals({ referer: 'https://news.ycombinator.com/foo' }),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.eventType, 'landing.viewed'));
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.actorType).toBe('system');
      expect(row.actorId).toBeNull();
      expect(row.signupId).toBeNull();
      expect(row.workspaceId).toBeNull();
      const payload = row.payload as Record<string, unknown>;
      expect(payload).toEqual({
        uaClass: 'browser',
        refererHost: 'news.ycombinator.com',
      });
    });

    it('records uaClass=unknown when UA is missing', async () => {
      await recordLandingView({
        signals: { userAgent: null, referer: null, dnt: false },
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.eventType, 'landing.viewed'));
      expect(rows).toHaveLength(1);
      const payload = rows[0]!.payload as Record<string, unknown>;
      expect(payload.uaClass).toBe('unknown');
      expect(payload.refererHost).toBeNull();
    });

    it('does not write when DNT/GPC is set', async () => {
      await recordLandingView({ signals: browserSignals({ dnt: true }) });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.eventType, 'landing.viewed'));
      expect(rows).toHaveLength(0);
    });

    it('does not write for a Googlebot UA', async () => {
      await recordLandingView({
        signals: browserSignals({
          userAgent:
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        }),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.eventType, 'landing.viewed'));
      expect(rows).toHaveLength(0);
    });
  });

  describe('recordLandingCtaClicked', () => {
    // Like landing.viewed, these rows have NULL signup_id/workspace_id, so the
    // suite-level cleanup (scoped to signupId) won't clear them. Wipe by
    // event_type; db tests run sequentially (fileParallelism: false).
    beforeEach(async () => {
      await db.delete(activity).where(eq(activity.eventType, 'landing.cta_clicked'));
    });

    it('writes a landing.cta_clicked row with NULL signup/workspace for a browser UA', async () => {
      await recordLandingCtaClicked({
        cta: 'start_signup',
        signals: browserSignals({ referer: 'https://opensignup.org/' }),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.eventType, 'landing.cta_clicked'));
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.actorType).toBe('system');
      expect(row.actorId).toBeNull();
      expect(row.signupId).toBeNull();
      expect(row.workspaceId).toBeNull();
      expect(row.payload).toEqual({
        cta: 'start_signup',
        uaClass: 'browser',
        refererHost: 'opensignup.org',
      });
    });

    it('persists the cta discriminator (demo_video)', async () => {
      await recordLandingCtaClicked({
        cta: 'demo_video',
        signals: browserSignals({}),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.eventType, 'landing.cta_clicked'));
      expect(rows).toHaveLength(1);
      const payload = rows[0]!.payload as Record<string, unknown>;
      expect(payload.cta).toBe('demo_video');
    });

    it('records uaClass=unknown when UA is missing', async () => {
      await recordLandingCtaClicked({
        cta: 'start_signup',
        signals: { userAgent: null, referer: null, dnt: false },
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.eventType, 'landing.cta_clicked'));
      expect(rows).toHaveLength(1);
      const payload = rows[0]!.payload as Record<string, unknown>;
      expect(payload.uaClass).toBe('unknown');
      expect(payload.refererHost).toBeNull();
    });

    it('does not write when DNT/GPC is set', async () => {
      await recordLandingCtaClicked({
        cta: 'start_signup',
        signals: browserSignals({ dnt: true }),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.eventType, 'landing.cta_clicked'));
      expect(rows).toHaveLength(0);
    });

    it('does not write for a Googlebot UA', async () => {
      await recordLandingCtaClicked({
        cta: 'start_signup',
        signals: browserSignals({
          userAgent:
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        }),
      });
      const rows = await db
        .select()
        .from(activity)
        .where(eq(activity.eventType, 'landing.cta_clicked'));
      expect(rows).toHaveLength(0);
    });
  });

  describe('recordOrganizerView', () => {
    it('writes a signup.editor_opened row with section payload', async () => {
      await recordOrganizerView({
        actor: { actorId: organizerId, actorType: 'organizer' },
        signupId,
        workspaceId,
        eventType: 'signup.editor_opened',
        payload: { section: 'slots' },
      });
      const rows = await db
        .select()
        .from(activity)
        .where(
          and(
            eq(activity.signupId, signupId),
            eq(activity.eventType, 'signup.editor_opened'),
          ),
        );
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.actorType).toBe('organizer');
      expect(row.actorId).toBe(organizerId);
      expect((row.payload as Record<string, unknown>).section).toBe('slots');
    });

    it('writes signup.draft_started without a signupId', async () => {
      await recordOrganizerView({
        actor: { actorId: organizerId, actorType: 'organizer' },
        signupId: null,
        workspaceId,
        eventType: 'signup.draft_started',
      });
      const rows = await db
        .select()
        .from(activity)
        .where(
          and(
            eq(activity.workspaceId, workspaceId),
            eq(activity.eventType, 'signup.draft_started'),
          ),
        );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0]!.signupId).toBeNull();
    });
  });
});
