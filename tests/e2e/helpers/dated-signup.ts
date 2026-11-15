import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { sessions } from '@/db/schema/auth';
import { organizers } from '@/db/schema/organizers';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import type { CatalogLocale } from '@/i18n/config';
import type { Actor } from '@/lib/policy';
import type { SignupTemplate } from '@/lib/signup-templates';
import { TEXT_DEFAULT_MAX_LENGTH } from '@/schemas/slot-fields';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';

/** A signup whose slots each have a date and a time, as `datedSignupIn` makes it. */
export interface DatedSignup {
  id: string;
  title: string;
  description: string;
  /** Its fields, in order: the date it's grouped by, a text field, a time. */
  fields: { ref: string; label: string; fieldType: string }[];
  /** Its slots' values, as stored, in order; someone has signed up for the first. */
  slots: { id: string; values: { when: string; what: string; start: string } }[];
  /** Who signed up for the first slot. */
  signedUp: string;
}

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
  what: string,
): T {
  if (!result.ok) throw new Error(`dated-signup: ${what} failed: ${result.error.message}`);
  return result.value;
}

/** A day `days` from today, as a date field stores it (YYYY-MM-DD). */
function dayFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A published signup whose language is `locale`, made by the organizer signed
 * in with `sessionToken`, in their own workspace: grouped by a date, each
 * slot with a time, and one person signed up for the first. For the specs
 * that check the organizer app formats a signup's dates and times in its
 * language, and marks its words with it where that isn't the organizer's.
 *
 * A language that hasn't shipped can't be chosen (`createSignup` refuses
 * it), so it's written into the row, and the app shows it only with it in
 * `E2E_UNSHIPPED_LOCALES`, as playwright.config.ts starts the server. The
 * organizer's workspace goes, and this with it, when `createOrganizerIn`
 * makes them again.
 */
export async function datedSignupIn(
  sessionToken: string,
  locale: CatalogLocale,
): Promise<DatedSignup> {
  const db = getDb();
  const [organizer] = await db
    .select({
      id: organizers.id,
      email: organizers.email,
      workspaceId: organizers.defaultWorkspaceId,
    })
    .from(sessions)
    .innerJoin(organizers, eq(organizers.id, sessions.userId))
    .where(eq(sessions.sessionToken, sessionToken));
  if (!organizer?.workspaceId) throw new Error('dated-signup: no organizer for that session');
  const actor: Actor = {
    kind: 'organizer',
    id: organizer.id,
    email: organizer.email,
    workspaceIds: [organizer.workspaceId],
    workspaceRoles: { [organizer.workspaceId]: 'owner' },
  };

  const fields: SignupTemplate['fields'] = [
    { ref: 'when', label: 'When', fieldType: 'date', sortOrder: 0, config: { fieldType: 'date' } },
    {
      ref: 'what',
      label: 'What',
      fieldType: 'text',
      sortOrder: 1,
      config: { fieldType: 'text', maxLength: TEXT_DEFAULT_MAX_LENGTH },
    },
    {
      ref: 'start',
      label: 'Start',
      fieldType: 'time',
      sortOrder: 2,
      config: { fieldType: 'time' },
    },
  ];
  const values = [
    { when: dayFromNow(30), what: 'Cookies', start: '18:30' },
    { when: dayFromNow(33), what: 'Lemonade', start: '09:15' },
  ];
  const title = 'Dated Bake Sale';
  const description = 'Seeded by tests/e2e/helpers/dated-signup.ts';
  const signup = unwrap(
    await createSignup(
      db,
      actor,
      organizer.workspaceId,
      {
        title,
        description,
        tags: [],
        visibility: 'unlisted' as const,
        settings: { groupByFieldRefs: ['when'] },
      },
      {
        template: {
          id: 'e2e-dated',
          fields,
          slots: values.map((v) => ({ capacity: 3, values: v })),
        },
      },
    ),
    'createSignup',
  );
  unwrap(await publishSignup(db, actor, signup.id), 'publishSignup');
  await db
    .update(signups)
    .set({ settings: { ...signup.settings, locale } })
    .where(eq(signups.id, signup.id));

  const rows = await db
    .select({ id: slots.id, values: slots.values })
    .from(slots)
    .where(eq(slots.signupId, signup.id));
  const made = values.map((v) => {
    const row = rows.find((r) => r.values.what === v.what);
    if (!row) throw new Error(`dated-signup: no slot ${v.what}`);
    return { id: row.id, values: v };
  });
  const signedUp = 'Pat Example';
  unwrap(
    await commitToSlot(db, made[0]!.id, { name: signedUp, email: 'pat@example.com', quantity: 1 }),
    'commitToSlot',
  );

  return {
    id: signup.id,
    title,
    description,
    fields: fields.map(({ ref, label, fieldType }) => ({ ref, label, fieldType })),
    slots: made,
    signedUp,
  };
}
