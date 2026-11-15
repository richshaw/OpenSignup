import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import type { CatalogLocale } from '@/i18n/config';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';
import { createDisposableSession } from './seed';

/** An organizer who stores a language (or none), signed in, with a signup of each kind. */
export interface OrganizerIn {
  sessionToken: string;
  /** A published signup of theirs, for the strip on its page and its Preview. */
  open: { id: string; slug: string };
  /** A draft of theirs, whose page tells its own organizer about it. */
  draft: { slug: string };
}

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
  what: string,
): T {
  if (!result.ok) throw new Error(`organizer-language: ${what} failed: ${result.error.message}`);
  return result.value;
}

/** Removes the organizer at `email` and everything in their workspace. */
async function remove(db: Db, email: string, workspaceSlug: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.slug, workspaceSlug));
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

  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };
  const make = async (title: string) =>
    unwrap(
      await createSignup(db, actor, workspaceId, {
        title,
        description: 'Seeded by tests/e2e/helpers/organizer-language.ts',
        tags: [],
        visibility: 'unlisted' as const,
        settings: {},
      }),
      `createSignup(${title})`,
    );

  const open = await make('Bake Sale');
  unwrap(
    await addSlot(db, actor, open.id, { values: { what: 'Cookies' }, capacity: 5 }),
    'addSlot',
  );
  unwrap(await publishSignup(db, actor, open.id), 'publishSignup');
  const draft = await make('Draft Picnic');

  return {
    sessionToken: await createDisposableSession(organizerId),
    open: { id: open.id, slug: open.slug },
    draft: { slug: draft.slug },
  };
}
