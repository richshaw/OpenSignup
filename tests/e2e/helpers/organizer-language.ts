import type { Locator } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { oauthRecords } from '@/db/schema/oauth';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { workspaces } from '@/db/schema/workspaces';
import type { CatalogLocale } from '@/i18n/config';
import { getTranslator, type Namespace } from '@/i18n/translator';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { createDisposableSession } from './seed';

/** `namespace`'s messages in `locale`, as vitest formats them, failing on a missing key. */
export function messagesIn<N extends Namespace>(locale: CatalogLocale, namespace: N) {
  return getTranslator(locale, namespace, {
    onError: (error) => {
      throw error;
    },
  });
}

/** The language `locator`'s element is in: its own `lang`, or its nearest ancestor's. */
export function languageOf(locator: Locator): Promise<string | null | undefined> {
  return locator.evaluate((element) => element.closest('[lang]')?.getAttribute('lang'));
}

/** An organizer who stores a language (or none), signed in, with a signup of each kind. */
export interface OrganizerIn {
  id: string;
  /** Their personal workspace, which holds their signups. */
  workspaceId: string;
  /** Their address, which account Settings says they're signed in as. */
  email: string;
  sessionToken: string;
  /**
   * A published signup of theirs, for the strip on its page and its Preview,
   * with one slot, "Cookies", that holds 5.
   */
  open: { id: string; slug: string; slotId: string };
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
 * with it in `E2E_UNSHIPPED_LOCALES` (`localeOfOrganizer` in
 * src/i18n/locale.ts), as playwright.config.ts starts it.
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
  const slot = unwrap(
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
    open: { id: open.id, slug: open.slug, slotId: slot.id },
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

/**
 * Gets `organizer`'s signup `signupId`, made in the browser, ready for a
 * participant: a slot, "Cookies", that holds 3, and published. With
 * `locale`, writes that language into its row first (`storeSignupLanguage`),
 * standing in for the organizer's language a new signup starts in once it has
 * shipped.
 */
export async function publishForParticipants(
  organizer: OrganizerIn,
  signupId: string,
  locale?: CatalogLocale,
): Promise<{ slug: string; slotId: string }> {
  const db = getDb();
  const actor = actorFor(organizer);
  if (locale) await storeSignupLanguage(signupId, locale);
  const slot = unwrap(
    await addSlot(db, actor, signupId, { values: { what: 'Cookies' }, capacity: 3 }),
    'addSlot',
  );
  const signup = unwrap(await publishSignup(db, actor, signupId), 'publishSignup');
  return { slug: signup.slug, slotId: slot.id };
}

/**
 * Writes `locale` into signup `signupId`'s row as its language. A new signup
 * starts in its organizer's language only once that language has shipped
 * (`newSignupLocale`), and a language that hasn't can't be chosen
 * (`createSignup` and `updateSignup` refuse it), so before then a spec stands
 * in for it here, and the server shows it only with it in
 * `E2E_UNSHIPPED_LOCALES`.
 */
export async function storeSignupLanguage(signupId: string, locale: CatalogLocale): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ settings: signups.settings })
    .from(signups)
    .where(eq(signups.id, signupId));
  await db
    .update(signups)
    .set({ settings: { ...row?.settings, locale } })
    .where(eq(signups.id, signupId));
}
