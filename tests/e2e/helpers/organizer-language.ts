import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { oauthRecords } from '@/db/schema/oauth';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import type { CatalogLocale } from '@/i18n/config';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { createDisposableSession } from './seed';

/** An organizer who stores a language (or none), signed in, with a signup of each kind. */
export interface OrganizerIn {
  id: string;
  /** Their personal workspace, which holds their signups. */
  workspaceId: string;
  /** Their address, which account Settings says they're signed in as. */
  email: string;
  sessionToken: string;
  /** A published signup of theirs, for the strip on its page and its Preview. */
  open: { id: string; slug: string };
  /**
   * A draft of theirs, with only the empty slot a new signup starts with: its
   * page tells its own organizer about it, and Publish and share's check stops
   * it.
   */
  draft: { id: string; slug: string };
}

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
  what: string,
): T {
  if (!result.ok) throw new Error(`organizer-language: ${what} failed: ${result.error.message}`);
  return result.value;
}

/** Removes the organizer at `email`, everything in their workspace and the apps they connected. */
async function remove(db: Db, email: string, workspaceSlug: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.slug, workspaceSlug));
  const [old] = await db
    .select({ id: organizers.id })
    .from(organizers)
    .where(eq(organizers.email, email));
  // Nothing ties a connected app's rows to the organizer, so they'd outlive them.
  if (old) await db.delete(oauthRecords).where(eq(oauthRecords.accountId, old.id));
  await db.delete(organizers).where(eq(organizers.email, email));
}

/**
 * An organizer whose account stores `stored`, or nothing for null, with a
 * session, an open signup and a draft, for the specs that check the organizer
 * app follows the account's language. A language that hasn't shipped can't
 * be saved on an account (`updateOrganizerLocale` refuses it), so it's
 * written into the row here, and the app shows it only on a server started
 * with it in `E2E_UNSHIPPED_LOCALES` (`organizerAppLocale` in
 * src/i18n/config.ts), as playwright.config.ts starts it.
 *
 * `tag` keeps callers apart, one per Playwright project, since the projects
 * run side by side: each call replaces the last one's organizer for the same
 * language and tag. Their signups store no language, so they're in the
 * instance's: what's in the organizer's language on their pages is the
 * organizer's own text.
 */
export async function createOrganizerIn(
  stored: CatalogLocale | null,
  tag: string,
): Promise<OrganizerIn> {
  const db = getDb();
  const name = `${stored ?? 'none'}-${tag}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const email = `language-${name}@example.test`;
  const workspaceSlug = `e2e-language-${name}`;
  await remove(db, email, workspaceSlug);

  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({
      id: organizerId,
      email,
      name: 'Language Organizer',
      defaultWorkspaceId: workspaceId,
      locale: stored,
    });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug: workspaceSlug,
      name: 'Language Workspace',
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

  const actor = actorFor({ id: organizerId, email, workspaceId });
  const open = await makeSignup(db, actor, workspaceId, 'Bake Sale');
  unwrap(
    await addSlot(db, actor, open.id, { values: { what: 'Cookies' }, capacity: 5 }),
    'addSlot',
  );
  unwrap(await publishSignup(db, actor, open.id), 'publishSignup');
  const draft = await makeSignup(db, actor, workspaceId, 'Draft Picnic');

  return {
    id: organizerId,
    workspaceId,
    email,
    sessionToken: await createDisposableSession(organizerId),
    open: { id: open.id, slug: open.slug },
    draft: { id: draft.id, slug: draft.slug },
  };
}

/** The organizer as the services take them: the owner of their workspace. */
function actorFor({
  id,
  email,
  workspaceId,
}: Pick<OrganizerIn, 'id' | 'email' | 'workspaceId'>): Actor {
  return {
    kind: 'organizer',
    id,
    email,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
}

/** A new signup called `title`, with the one empty slot a new signup starts with. */
async function makeSignup(db: Db, actor: Actor, workspaceId: string, title: string) {
  return unwrap(
    await createSignup(db, actor, workspaceId, {
      title,
      description: 'Seeded by tests/e2e/helpers/organizer-language.ts',
      tags: [],
      visibility: 'unlisted' as const,
      settings: {},
    }),
    `createSignup(${title})`,
  );
}

/** A signup of the organizer's whose language is another than theirs. */
export interface SignupIn {
  id: string;
  slug: string;
  title: string;
}

/**
 * A published signup of `organizer`'s whose language is `locale`, for the
 * share panel, which is in the organizer's language while the message it
 * offers to send is in the signup's. A language that hasn't shipped can't be
 * chosen (`createSignup` refuses it), so it's written into the row, and shown
 * only with it in `E2E_UNSHIPPED_LOCALES`, as the organizer's own is. Made by
 * the test that reads it, so the other tests still count two signups; besides
 * the empty slot a new signup starts with, it has Blankets for 4. `remove`
 * takes it away with the rest of the workspace.
 */
export async function publishSignupIn(
  organizer: OrganizerIn,
  locale: CatalogLocale,
): Promise<SignupIn> {
  const db = getDb();
  const actor = actorFor(organizer);
  const signup = await makeSignup(db, actor, organizer.workspaceId, 'Picnic Abroad');
  unwrap(
    await addSlot(db, actor, signup.id, { values: { what: 'Blankets' }, capacity: 4 }),
    'addSlot',
  );
  unwrap(await publishSignup(db, actor, signup.id), 'publishSignup');
  await db
    .update(signups)
    .set({ settings: { ...signup.settings, locale } })
    .where(eq(signups.id, signup.id));
  return { id: signup.id, slug: signup.slug, title: signup.title };
}

/** When a connected app was approved, last used and runs out. */
export interface ConnectedAppDates {
  approvedAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

/**
 * An app `organizer` has connected, approved to see and edit their signups,
 * as Connected apps lists it: written straight into `oauth_records` as the
 * Grant row the OAuth provider keeps, since these specs check the page, not
 * the approval. Approved and last used at noon on two days already past, and
 * running out a month from now, so it stays live whenever the spec runs.
 * Replaces the organizer's earlier one; `remove` takes it away with them.
 */
export async function connectAppFor(organizer: OrganizerIn): Promise<ConnectedAppDates> {
  const db = getDb();
  const dates: ConnectedAppDates = {
    approvedAt: new Date(2026, 10, 14, 12),
    lastUsedAt: new Date(2026, 10, 15, 12),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
  const clientId = 'https://assistant.example.com/client.json';
  await db.delete(oauthRecords).where(eq(oauthRecords.accountId, organizer.id));
  await db.insert(oauthRecords).values({
    model: 'Grant',
    id: `e2e-language-grant-${organizer.id}`,
    payload: {
      accountId: organizer.id,
      clientId,
      resources: { 'http://localhost/api/mcp': 'signups:read signups:write' },
    },
    accountId: organizer.id,
    clientId,
    clientName: 'Example Assistant',
    createdAt: dates.approvedAt,
    lastUsedAt: dates.lastUsedAt,
    expiresAt: dates.expiresAt,
  });
  return dates;
}
