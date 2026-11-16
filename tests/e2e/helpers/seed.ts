import { createHash, randomBytes } from 'node:crypto';
import { issueLoginCode } from '@/auth/login-code';
import { verificationTokens } from '@/db/schema/auth';
import { getEnv } from '@/lib/env';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { sessions } from '@/db/schema/auth';
import { rateLimits } from '@/db/schema/rate-limits';
import { workspaceMembers } from '@/db/schema/members';
import { oauthRecords } from '@/db/schema/oauth';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import { commitmentEditPath, unsubscribePath } from '@/lib/links';
import type { Actor } from '@/lib/policy';
import { RateLimits } from '@/lib/rate-limit';
import { signups, type Signup as SignupRow } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import type { SignupTemplate } from '@/lib/signup-templates';
import { TEXT_DEFAULT_MAX_LENGTH } from '@/schemas/slot-fields';
import { cancelOwnCommitment, commitToSlot, type CommitResult } from '@/services/commitments';
import { optOutOfReminders, reminderOptOutTokenFor } from '@/services/reminder-optout';
import {
  archiveSignup,
  closeSignup,
  createSignup,
  deleteSignup,
  publishSignup,
} from '@/services/signups';
import { addSlot } from '@/services/slots';

const E2E_ORGANIZER_EMAIL = 'e2e@example.test';
const E2E_WORKSPACE_SLUG = 'e2e-workspace';
// See createSoloOrganizer. The address shows in a help screenshot.
const SOLO_ORGANIZER_EMAIL = 'you@example.test';
const SOLO_WORKSPACE_SLUG = 'e2e-solo-workspace';

const SEED_FILE = path.join(process.cwd(), 'tests', 'e2e', '.seed.json');

export interface SeedData {
  sessionToken: string;
  organizerId: string;
  organizerEmail: string;
  /** Published signup with an open slot ("Cookies") and a full slot ("Brownies"). */
  publicSlug: string;
  publicTitle: string;
  openSlotLabel: string;
  fullSlotLabel: string;
  /** Draft signup for the organizer publish flow. */
  draftSignupId: string;
  draftTitle: string;
  /** Published signup with a seeded commitment for the edit-token flow. */
  editSlug: string;
  editSlotId: string;
  editCommitmentId: string;
  editToken: string;
  /** Deleted signup, and an edit link to a commitment that was on it. */
  deletedSlug: string;
  deletedCommitmentId: string;
  deletedToken: string;
  /** Published signup whose settings make the email optional, with an open slot. */
  optionalEmailSlug: string;
  optionalEmailSlotLabel: string;
  /** Published signup in Swedish: see makeSwedishSignup. */
  swedish: SwedishSeed;
  /** Draft in Swedish for its Build tab: see makeSwedishBuildSignup. */
  swedishBuild: SwedishBuildSeed;
  /** Closed and archived signups in Swedish: see makeSwedishClosedAndArchived. */
  swedishClosed: SwedishClosedSeed;
  swedishArchived: SwedishArchivedSeed;
}

/**
 * A sign-up as the browser that made it remembers it: its entry in the
 * returning-participant cookie (`os_commit`), which shows its person their
 * own spots on the signup's page.
 */
export interface Remembered {
  signupId: string;
  commitmentId: string;
  token: string;
}

/**
 * The Swedish test signup's slots, by what each exercises. Grouped by date,
 * so the slots with no date sit under "(datum saknas)".
 */
const SWEDISH_SLOTS = {
  /**
   * Capacity 20, one taken: "19 kvar", "19 av 20 platser kvar". Its name has
   * å, ä and ö, which the calendar file's name keeps.
   */
  many: 'Räksmörgås',
  /** Capacity 1, open: the row's Sign up and nothing in the count column. */
  one: 'Saft',
  /** Capacity 1, taken: Full. */
  full: 'Bullar',
  /** No date, no limit, one taken: "1 anmäld", the plural's one. */
  unlimitedOne: 'Disk',
  /** No date, no limit, two taken: "2 anmälda", the plural's other. */
  unlimitedTwo: 'Städning',
} as const;

interface SwedishSeed {
  id: string;
  slug: string;
  title: string;
  /** The heading over the slots with no date: the date field's "(no …)". */
  noDateHeading: string;
  slots: typeof SWEDISH_SLOTS;
  /** The date `slots.many` is on, as its date field stores it (YYYY-MM-DD). */
  manyDate: string;
  /** The edit link and the unsubscribe link of the sign-up on `slots.many`, and who made it. */
  editPath: string;
  /** That sign-up as its browser remembers it. */
  remembered: Remembered;
  unsubscribePath: string;
  editName: string;
  editEmail: string;
  /**
   * The edit link of a sign-up on `slots.many` that was cancelled, which shows
   * the cancelled page. Cancelled, it takes no spot, so the counts stay as above.
   */
  cancelledEditPath: string;
  /** The unsubscribe link of the person on `slots.unlimitedOne`, who has turned reminders off, and their email. */
  optedOutUnsubscribePath: string;
  optedOutEmail: string;
}

interface SwedishClosedSeed {
  slug: string;
  /** The sign-up still on it, as its browser remembers it, and its edit link. */
  remembered: Remembered;
  editPath: string;
  /** The edit link of a sign-up cancelled before the signup closed. */
  cancelledEditPath: string;
}

interface SwedishArchivedSeed {
  slug: string;
}

/**
 * The Swedish Build-tab draft's groups, in Swedish alphabetical order, where
 * Å, Ä and Ö come after Z. English puts Äpple and Ödla among the A's and O's,
 * before Zebra. The draft's slots are in neither order.
 */
const SWEDISH_BUILD_GROUPS = ['Apa', 'Zebra', 'Äpple', 'Ödla'] as const;

interface SwedishBuildSeed {
  id: string;
  /** Its page's address: a draft's, which tells visitors it isn't ready. */
  slug: string;
  /** The group field's values, in the order the Build tab sorts them. */
  groups: typeof SWEDISH_BUILD_GROUPS;
}

/** Removes an e2e organizer and its data. Workspace delete cascades signups →
 *  slots → participants → commitments; organizer delete cascades sessions. */
async function removeOrganizer(db: Db, email: string, workspaceSlug: string): Promise<void> {
  const [org] = await db
    .select({ id: organizers.id })
    .from(organizers)
    .where(eq(organizers.email, email))
    .limit(1);
  await db.delete(workspaces).where(eq(workspaces.slug, workspaceSlug));
  if (org) {
    // Apps they connected: nothing ties these rows to the organizer, so
    // they would otherwise outlive them until they expire.
    await db.delete(oauthRecords).where(eq(oauthRecords.accountId, org.id));
    await db.delete(organizers).where(eq(organizers.id, org.id));
  }
}

/** An organizer with a personal workspace they own, as first sign-in makes. */
async function insertOrganizer(
  db: Db,
  email: string,
  workspaceSlug: string,
  names: { organizer: string; workspace: string },
): Promise<{ organizerId: string; workspaceId: string }> {
  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({
      id: organizerId,
      email,
      name: names.organizer,
      defaultWorkspaceId: workspaceId,
    });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug: workspaceSlug,
      name: names.workspace,
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
  return { organizerId, workspaceId };
}

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
  what: string,
): T {
  if (!result.ok) throw new Error(`seed: ${what} failed: ${result.error.message}`);
  return result.value;
}

async function makePublishedSignup(
  db: Db,
  actor: Actor,
  workspaceId: string,
  title: string,
  slotLabels: { label: string; capacity: number }[],
  settings: { requireEmail?: boolean } = {},
): Promise<{ id: string; slug: string; slotIds: string[] }> {
  const signup = unwrap(
    await createSignup(db, actor, workspaceId, {
      title,
      description: 'Seeded by tests/e2e/helpers/seed.ts',
      tags: [],
      visibility: 'unlisted' as const,
      settings,
    }),
    `createSignup(${title})`,
  );
  // createSignup applies the default template: a 'what' text field, a 'date'
  // field, and one empty slot. Keep the fields, drop the placeholder slot so
  // the page shows exactly the labeled slots below.
  await db.delete(slots).where(eq(slots.signupId, signup.id));
  const slotIds: string[] = [];
  for (const { label, capacity } of slotLabels) {
    const slot = unwrap(
      await addSlot(db, actor, signup.id, { values: { what: label }, capacity }),
      `addSlot(${label})`,
    );
    slotIds.push(slot.id);
  }
  unwrap(await publishSignup(db, actor, signup.id), `publishSignup(${title})`);
  return { id: signup.id, slug: signup.slug, slotIds };
}

/**
 * Writes Swedish into a signup's row. Swedish can't be chosen until it ships
 * (`createSignup` refuses it), so the seed writes it after creating the
 * signup. It hasn't shipped, so the signup shows in it only on a server
 * started with `E2E_UNSHIPPED_LOCALES=sv`, which playwright.config.ts gives
 * the server it starts (`signupLocale` in src/i18n/config.ts).
 */
async function writeSwedish(db: Db, signup: SignupRow): Promise<void> {
  await db
    .update(signups)
    .set({ settings: { ...signup.settings, locale: 'sv' } })
    .where(eq(signups.id, signup.id));
}

/** A day `days` from today, as a date field stores it (YYYY-MM-DD). */
function dayFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A published signup whose language is Swedish, for the specs that check the
 * participant pages in a second language. Fields and slots are an organizer's
 * in Swedish, as a Swedish signup's would be. Swedish is written into the
 * row afterwards (`writeSwedish`).
 */
async function makeSwedishSignup(db: Db, actor: Actor, workspaceId: string): Promise<SwedishSeed> {
  const title = 'Fika till vårfesten';
  const manyDate = dayFromNow(30);
  const template: SignupTemplate = {
    id: 'e2e-swedish',
    fields: [
      {
        ref: 'vad',
        label: 'Vad',
        fieldType: 'text',
        sortOrder: 0,
        config: { fieldType: 'text', maxLength: TEXT_DEFAULT_MAX_LENGTH },
      },
      {
        ref: 'datum',
        label: 'Datum',
        fieldType: 'date',
        sortOrder: 1,
        config: { fieldType: 'date' },
      },
    ],
    slots: [
      { capacity: 20, values: { vad: SWEDISH_SLOTS.many, datum: manyDate } },
      { capacity: 1, values: { vad: SWEDISH_SLOTS.one, datum: dayFromNow(30) } },
      { capacity: 1, values: { vad: SWEDISH_SLOTS.full, datum: dayFromNow(31) } },
      { capacity: null, values: { vad: SWEDISH_SLOTS.unlimitedOne } },
      { capacity: null, values: { vad: SWEDISH_SLOTS.unlimitedTwo } },
    ],
  };
  const signup = unwrap(
    await createSignup(
      db,
      actor,
      workspaceId,
      {
        title,
        description: 'Ta med något gott till vårfesten. Seeded by tests/e2e/helpers/seed.ts',
        tags: [],
        visibility: 'unlisted' as const,
        // Email optional, so the sheet shows the email box's help, with its
        // reminder clause on a dated slot and without it on one with no date.
        settings: { groupByFieldRefs: ['datum'], requireEmail: false },
      },
      { template },
    ),
    `createSignup(${title})`,
  );
  await writeSwedish(db, signup);
  unwrap(await publishSignup(db, actor, signup.id), `publishSignup(${title})`);

  const slotIds = new Map(
    (
      await db
        .select({ id: slots.id, values: slots.values })
        .from(slots)
        .where(eq(slots.signupId, signup.id))
    ).map((slot) => [slot.values.vad, slot.id]),
  );
  const taken: [string, number][] = [
    [SWEDISH_SLOTS.many, 1],
    [SWEDISH_SLOTS.full, 1],
    [SWEDISH_SLOTS.unlimitedOne, 1],
    [SWEDISH_SLOTS.unlimitedTwo, 2],
  ];
  let n = 0;
  const made: (CommitResult & { name: string; email: string })[] = [];
  for (const [label, people] of taken) {
    for (let i = 0; i < people; i += 1) {
      n += 1;
      const person = { name: `Deltagare ${n}`, email: `deltagare${n}@example.test` };
      made.push({
        ...unwrap(
          await commitToSlot(db, slotIds.get(label)!, { ...person, quantity: 1 }),
          `commitToSlot(${label})`,
        ),
        ...person,
      });
    }
  }
  // The first is the one on `many`, which has a date.
  const { commitment, editToken, name, email } = made[0]!;

  n += 1;
  const cancelled = unwrap(
    await commitToSlot(db, slotIds.get(SWEDISH_SLOTS.many)!, {
      name: `Deltagare ${n}`,
      email: `deltagare${n}@example.test`,
      quantity: 1,
    }),
    'commitToSlot(cancelled)',
  );
  unwrap(
    await cancelOwnCommitment(db, cancelled.commitment.id, cancelled.editToken),
    'cancelOwnCommitment',
  );
  // The third is the one on `unlimitedOne`.
  const optedOutPerson = made[2]!;
  const optedOut = optedOutPerson.commitment.participantId;
  unwrap(
    await optOutOfReminders(db, optedOut, reminderOptOutTokenFor(optedOut)),
    'optOutOfReminders',
  );

  return {
    id: signup.id,
    slug: signup.slug,
    title,
    noDateHeading: '(datum saknas)',
    slots: SWEDISH_SLOTS,
    manyDate,
    editPath: commitmentEditPath(signup.slug, commitment.id, editToken),
    remembered: { signupId: signup.id, commitmentId: commitment.id, token: editToken },
    unsubscribePath: unsubscribePath(
      signup.slug,
      commitment.participantId,
      reminderOptOutTokenFor(commitment.participantId),
    ),
    editName: name,
    editEmail: email,
    cancelledEditPath: commitmentEditPath(
      signup.slug,
      cancelled.commitment.id,
      cancelled.editToken,
    ),
    optedOutUnsubscribePath: unsubscribePath(
      signup.slug,
      optedOut,
      reminderOptOutTokenFor(optedOut),
    ),
    optedOutEmail: optedOutPerson.email,
  };
}

/**
 * A draft whose language is Swedish, for the specs on its Build tab, which
 * sorts groups in the signup's language and names a new field's defaults in
 * it. Grouped by a text field, so the order of its groups depends on the
 * language, with a date and a time on each slot, which the tab formats.
 * Swedish is written into the row afterwards, as for makeSwedishSignup, and
 * shows only on a server started with `E2E_UNSHIPPED_LOCALES=sv`. Specs may
 * add fields to it.
 */
async function makeSwedishBuildSignup(
  db: Db,
  actor: Actor,
  workspaceId: string,
): Promise<SwedishBuildSeed> {
  const template: SignupTemplate = {
    id: 'e2e-swedish-build',
    fields: [
      {
        ref: 'grupp',
        label: 'Grupp',
        fieldType: 'text',
        sortOrder: 0,
        config: { fieldType: 'text', maxLength: TEXT_DEFAULT_MAX_LENGTH },
      },
      {
        ref: 'datum',
        label: 'Datum',
        fieldType: 'date',
        sortOrder: 1,
        config: { fieldType: 'date' },
      },
      { ref: 'tid', label: 'Tid', fieldType: 'time', sortOrder: 2, config: { fieldType: 'time' } },
    ],
    slots: ['Ödla', 'Zebra', 'Äpple', 'Apa'].map((grupp, i) => ({
      capacity: 2,
      values: { grupp, datum: dayFromNow(30 + i), tid: '18:30' },
    })),
  };
  const signup = unwrap(
    await createSignup(
      db,
      actor,
      workspaceId,
      {
        title: 'Städdag i parken',
        description: 'Seeded by tests/e2e/helpers/seed.ts',
        tags: [],
        visibility: 'unlisted' as const,
        settings: { groupByFieldRefs: ['grupp'] },
      },
      { template },
    ),
    'createSignup(Städdag i parken)',
  );
  await writeSwedish(db, signup);
  return { id: signup.id, slug: signup.slug, groups: SWEDISH_BUILD_GROUPS };
}

/**
 * Two more signups in Swedish, for the pages a signup shows once it has
 * closed or been archived, which a translation's review reads from the
 * screenshots the Swedish spec saves (`translationShot`). The closed one keeps
 * one sign-up, whose own page and edit page say it's still theirs, and has
 * one cancelled before it closed. Swedish is written into each row
 * (`writeSwedish`).
 */
async function makeSwedishClosedAndArchived(
  db: Db,
  actor: Actor,
  workspaceId: string,
): Promise<{ closed: SwedishClosedSeed; archived: SwedishArchivedSeed }> {
  const fields: SignupTemplate['fields'] = [
    {
      ref: 'vad',
      label: 'Vad',
      fieldType: 'text',
      sortOrder: 0,
      config: { fieldType: 'text', maxLength: TEXT_DEFAULT_MAX_LENGTH },
    },
    {
      ref: 'datum',
      label: 'Datum',
      fieldType: 'date',
      sortOrder: 1,
      config: { fieldType: 'date' },
    },
  ];
  const make = async (title: string, slotValues: { vad: string; capacity: number }[]) => {
    const signup = unwrap(
      await createSignup(
        db,
        actor,
        workspaceId,
        {
          title,
          description: 'Seeded by tests/e2e/helpers/seed.ts',
          tags: [],
          visibility: 'unlisted' as const,
          settings: { requireEmail: false },
        },
        {
          template: {
            id: 'e2e-swedish-states',
            fields,
            slots: slotValues.map(({ vad, capacity }) => ({
              capacity,
              values: { vad, datum: dayFromNow(20) },
            })),
          },
        },
      ),
      `createSignup(${title})`,
    );
    await writeSwedish(db, signup);
    unwrap(await publishSignup(db, actor, signup.id), `publishSignup(${title})`);
    return signup;
  };

  const closedTitle = 'Loppis i aulan';
  const closed = await make(closedTitle, [
    { vad: 'Kaffe', capacity: 4 },
    { vad: 'Tårta', capacity: 1 },
  ]);
  const kaffe = (
    await db
      .select({ id: slots.id, values: slots.values })
      .from(slots)
      .where(eq(slots.signupId, closed.id))
  ).find((slot) => slot.values.vad === 'Kaffe');
  const kept = unwrap(
    await commitToSlot(db, kaffe!.id, {
      name: 'Deltagare 1',
      email: 'loppis1@example.test',
      quantity: 1,
    }),
    'commitToSlot(Kaffe)',
  );
  const cancelled = unwrap(
    await commitToSlot(db, kaffe!.id, {
      name: 'Deltagare 2',
      email: 'loppis2@example.test',
      quantity: 1,
    }),
    'commitToSlot(Kaffe, cancelled)',
  );
  unwrap(
    await cancelOwnCommitment(db, cancelled.commitment.id, cancelled.editToken),
    'cancelOwnCommitment(Kaffe)',
  );
  unwrap(await closeSignup(db, actor, closed.id), `closeSignup(${closedTitle})`);

  const archivedTitle = 'Vårkonsert';
  const archived = await make(archivedTitle, [{ vad: 'Biljettbord', capacity: 2 }]);
  unwrap(await archiveSignup(db, actor, archived.id), `archiveSignup(${archivedTitle})`);

  return {
    closed: {
      slug: closed.slug,
      remembered: {
        signupId: closed.id,
        commitmentId: kept.commitment.id,
        token: kept.editToken,
      },
      editPath: commitmentEditPath(closed.slug, kept.commitment.id, kept.editToken),
      cancelledEditPath: commitmentEditPath(
        closed.slug,
        cancelled.commitment.id,
        cancelled.editToken,
      ),
    },
    archived: { slug: archived.slug },
  };
}

export async function seedE2E(): Promise<SeedData> {
  const db = getDb();
  await removeOrganizer(db, E2E_ORGANIZER_EMAIL, E2E_WORKSPACE_SLUG);

  const { organizerId, workspaceId } = await insertOrganizer(
    db,
    E2E_ORGANIZER_EMAIL,
    E2E_WORKSPACE_SLUG,
    { organizer: 'E2E Organizer', workspace: 'E2E Workspace' },
  );

  const sessionToken = randomBytes(32).toString('hex');
  await db.insert(sessions).values({
    sessionToken,
    userId: organizerId,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const actor: Actor = {
    kind: 'organizer',
    id: organizerId,
    email: E2E_ORGANIZER_EMAIL,
    workspaceIds: [workspaceId],
    workspaceRoles: { [workspaceId]: 'owner' },
  };

  // Public signup: one open slot, one full slot.
  const publicSignup = await makePublishedSignup(db, actor, workspaceId, 'Bake Sale', [
    { label: 'Cookies', capacity: 5 },
    { label: 'Brownies', capacity: 1 },
  ]);
  unwrap(
    await commitToSlot(db, publicSignup.slotIds[1]!, {
      name: 'Robin Baker',
      email: 'robin@example.test',
      quantity: 1,
    }),
    'commitToSlot(Brownies)',
  );

  // Edit-token signup: one slot with a seeded commitment.
  const editSignup = await makePublishedSignup(db, actor, workspaceId, 'Carpool Roster', [
    { label: 'Saturday drive', capacity: 20 },
  ]);
  const editCommit = unwrap(
    await commitToSlot(db, editSignup.slotIds[0]!, {
      name: 'Casey Editor',
      email: 'casey@example.test',
      quantity: 1,
    }),
    'commitToSlot(Saturday drive)',
  );

  // Deleted signup: its page and its edit links must read exactly as an
  // unknown slug does.
  const deletedSignup = await makePublishedSignup(db, actor, workspaceId, 'Removed Potluck', [
    { label: 'Salad', capacity: 3 },
  ]);
  const deletedCommit = unwrap(
    await commitToSlot(db, deletedSignup.slotIds[0]!, {
      name: 'Jordan Gone',
      email: 'jordan@example.test',
      quantity: 1,
    }),
    'commitToSlot(Salad)',
  );
  unwrap(await deleteSignup(db, actor, deletedSignup.id), 'deleteSignup(Removed Potluck)');

  // A signup that lets participants leave the email blank.
  const optionalEmailSignup = await makePublishedSignup(
    db,
    actor,
    workspaceId,
    'Litter Pick',
    [{ label: 'Park gate', capacity: 20 }],
    { requireEmail: false },
  );

  const swedish = await makeSwedishSignup(db, actor, workspaceId);
  const swedishBuild = await makeSwedishBuildSignup(db, actor, workspaceId);
  const { closed: swedishClosed, archived: swedishArchived } = await makeSwedishClosedAndArchived(
    db,
    actor,
    workspaceId,
  );

  // Draft signup for the organizer publish flow.
  const draft = unwrap(
    await createSignup(db, actor, workspaceId, {
      title: 'Draft Picnic',
      description: 'Seeded draft for the publish smoke test',
      tags: [],
      visibility: 'unlisted' as const,
      settings: {},
    }),
    'createSignup(Draft Picnic)',
  );

  const data: SeedData = {
    sessionToken,
    organizerId,
    organizerEmail: E2E_ORGANIZER_EMAIL,
    publicSlug: publicSignup.slug,
    publicTitle: 'Bake Sale',
    openSlotLabel: 'Cookies',
    fullSlotLabel: 'Brownies',
    draftSignupId: draft.id,
    draftTitle: 'Draft Picnic',
    editSlug: editSignup.slug,
    editSlotId: editSignup.slotIds[0]!,
    editCommitmentId: editCommit.commitment.id,
    editToken: editCommit.editToken,
    deletedSlug: deletedSignup.slug,
    deletedCommitmentId: deletedCommit.commitment.id,
    deletedToken: deletedCommit.editToken,
    optionalEmailSlug: optionalEmailSignup.slug,
    optionalEmailSlotLabel: 'Park gate',
    swedish,
    swedishBuild,
    swedishClosed,
    swedishArchived,
  };
  writeFileSync(SEED_FILE, JSON.stringify(data, null, 2));
  return data;
}

/**
 * Empties the sign-in rate limits, for every address and IP. Their counts
 * outlive a run, and login-code.spec.ts sends a link to the seeded organizer
 * and redeems a code for it every time, so from the sixth local run in an
 * hour (5 links per address) the send would be refused and the page would
 * say it couldn't send.
 */
export async function clearSignInRateLimits(): Promise<void> {
  const buckets = [
    RateLimits.magicLinkPerEmail,
    RateLimits.magicLinkPerIp,
    RateLimits.loginCodePerEmail,
    RateLimits.loginCodePerIp,
  ].map((policy) => policy.bucket);
  await getDb().delete(rateLimits).where(inArray(rateLimits.bucket, buckets));
}

/**
 * A throwaway session for a test that signs out. Sign-out deletes the
 * session row, so such a test must never borrow the shared one — and must
 * mint a fresh row on every attempt, retries included.
 */
export async function createDisposableSession(organizerId: string): Promise<string> {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  await db.insert(sessions).values({
    sessionToken: token,
    userId: organizerId,
    expires: new Date(Date.now() + 60 * 60 * 1000),
  });
  return token;
}

/**
 * A fresh organizer of their own, with nothing in their account, signed in
 * through a new session. For a test that changes something account-wide,
 * like connecting an app, which tests sharing the seeded organizer would trip
 * over. Each call replaces the last one's organizer and data, so a single
 * test may use it at a time.
 */
export async function createSoloOrganizer(): Promise<{
  organizerId: string;
  email: string;
  sessionToken: string;
}> {
  const db = getDb();
  await removeOrganizer(db, SOLO_ORGANIZER_EMAIL, SOLO_WORKSPACE_SLUG);
  const { organizerId } = await insertOrganizer(db, SOLO_ORGANIZER_EMAIL, SOLO_WORKSPACE_SLUG, {
    organizer: 'Solo Organizer',
    workspace: 'Solo Workspace',
  });
  return {
    organizerId,
    email: SOLO_ORGANIZER_EMAIL,
    sessionToken: await createDisposableSession(organizerId),
  };
}

/**
 * Mint a real magic-link callback for the seeded organizer — a
 * `verification_tokens` row hashed the way Auth.js hashes it
 * (sha256(token + secret)) — and a sign-in code that redeems it. Lets a
 * browser test walk the code path end to end without reading an inbox.
 */
export async function mintLoginCodeForTest(email: string, callbackUrl: string): Promise<string> {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(verificationTokens).values({
    identifier: email,
    token: createHash('sha256').update(`${token}${getEnv().AUTH_SECRET}`).digest('hex'),
    expires,
  });
  const authCallback = new URL('/api/auth/callback/nodemailer', getEnv().AUTH_URL);
  authCallback.searchParams.set('callbackUrl', callbackUrl);
  authCallback.searchParams.set('token', token);
  authCallback.searchParams.set('email', email);
  const { code } = await issueLoginCode(db, {
    email,
    callbackUrl: authCallback.toString(),
    expiresAt: expires,
  });
  return code;
}
