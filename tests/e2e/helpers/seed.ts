import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { sessions } from '@/db/schema/auth';
import { workspaceMembers } from '@/db/schema/members';
import { organizers } from '@/db/schema/organizers';
import { workspaces } from '@/db/schema/workspaces';
import { makeId } from '@/lib/ids';
import type { Actor } from '@/lib/policy';
import { slots } from '@/db/schema/slots';
import { commitToSlot } from '@/services/commitments';
import { createSignup, publishSignup } from '@/services/signups';
import { addSlot } from '@/services/slots';

const E2E_ORGANIZER_EMAIL = 'e2e@example.test';
const E2E_WORKSPACE_SLUG = 'e2e-workspace';

export const SEED_FILE = path.join(process.cwd(), 'tests', 'e2e', '.seed.json');

export interface SeedData {
  sessionToken: string;
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
}

/** Removes any prior e2e data. Workspace delete cascades signups → slots →
 *  participants → commitments; organizer delete cascades sessions. */
async function cleanup(db: Db): Promise<void> {
  const [org] = await db
    .select({ id: organizers.id })
    .from(organizers)
    .where(eq(organizers.email, E2E_ORGANIZER_EMAIL))
    .limit(1);
  await db.delete(workspaces).where(eq(workspaces.slug, E2E_WORKSPACE_SLUG));
  if (org) await db.delete(organizers).where(eq(organizers.id, org.id));
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
): Promise<{ id: string; slug: string; slotIds: string[] }> {
  const signup = unwrap(
    await createSignup(db, actor, workspaceId, {
      title,
      description: 'Seeded by tests/e2e/helpers/seed.ts',
      tags: [],
      visibility: 'unlisted' as const,
      settings: {},
    }),
    `createSignup(${title})`,
  );
  // createSignup applies DEFAULT_TEMPLATE: a 'what' text field, a 'date'
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

export async function seedE2E(): Promise<SeedData> {
  const db = getDb();
  await cleanup(db);

  const organizerId = makeId('org');
  const workspaceId = makeId('ws');
  await db.transaction(async (tx) => {
    await tx.insert(organizers).values({
      id: organizerId,
      email: E2E_ORGANIZER_EMAIL,
      name: 'E2E Organizer',
      defaultWorkspaceId: workspaceId,
    });
    await tx.insert(workspaces).values({
      id: workspaceId,
      slug: E2E_WORKSPACE_SLUG,
      name: 'E2E Workspace',
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
  };
  writeFileSync(SEED_FILE, JSON.stringify(data, null, 2));
  return data;
}
