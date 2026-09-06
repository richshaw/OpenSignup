/**
 * One-off backfill: rebuild `slots.slot_at` for every signup.
 *
 * `slot_at` is a cache of (resolved anchor field, slot values). Two changes
 * leave it stale on existing rows:
 *
 *   - Anchor resolution is now total. A signup with two or more date fields and
 *     no `reminderFromFieldRef` used to resolve to no anchor at all, so every
 *     slot_at was NULL and the dispatcher skipped the whole signup. Those
 *     signups now resolve to their first date field, but nothing rewrites the
 *     rows until someone edits a slot.
 *   - `addField` / `updateField` never recomputed, and `deleteField` only did
 *     so when the pointer happened to be set. Signups touched before that was
 *     fixed can hold a slot_at derived from a field that is no longer the
 *     anchor, or no longer a date, or gone.
 *
 * Written as a script rather than a SQL migration on purpose: the resolution
 * rule lives in `findReminderFields`, and a migration that reimplemented it in
 * SQL would be a second copy to drift from the first. This calls the real one.
 *
 * Safe to re-run. `recomputeSlotAtForSignup` compares before writing, so a
 * second pass over an already-correct signup updates nothing.
 *
 * Usage:
 *   pnpm backfill:slot-at            # report what would change, write nothing
 *   pnpm backfill:slot-at --apply    # write
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { asc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import {
  extractSlotAt,
  listFieldsForSignup,
  recomputeSlotAtForSignup,
} from '@/services/slot-fields';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const db = getDb();

  const rows = await db
    .select({ id: signups.id, title: signups.title, settings: signups.settings })
    .from(signups)
    .where(isNull(signups.deletedAt))
    .orderBy(asc(signups.createdAt));

  console.log(`${rows.length} signup(s) to check${apply ? '' : ' (dry run)'}\n`);

  let changedSignups = 0;
  let changedSlots = 0;

  for (const signup of rows) {
    if (apply) {
      const { updated } = await recomputeSlotAtForSignup(db, signup.id);
      if (updated > 0) {
        changedSignups++;
        changedSlots += updated;
        console.log(`  ${signup.id}  ${updated} slot(s)  ${signup.title}`);
      }
      continue;
    }

    // Dry run: the same comparison recomputeSlotAtForSignup makes, without the write.
    const settings = (signup.settings as Record<string, unknown>) ?? {};
    const fields = await listFieldsForSignup(db, signup.id);
    const slotRows = await db
      .select({ id: slots.id, values: slots.values, slotAt: slots.slotAt })
      .from(slots)
      .where(eq(slots.signupId, signup.id));

    let pending = 0;
    for (const slot of slotRows) {
      const next = extractSlotAt(settings, fields, (slot.values as Record<string, unknown>) ?? {});
      const cur = slot.slotAt;
      const same =
        (next === null && cur === null) ||
        (next instanceof Date && cur instanceof Date && next.getTime() === cur.getTime());
      if (!same) pending++;
    }
    if (pending > 0) {
      changedSignups++;
      changedSlots += pending;
      console.log(`  ${signup.id}  ${pending} slot(s)  ${signup.title}`);
    }
  }

  console.log(
    `\n${changedSlots} slot(s) across ${changedSignups} signup(s) ${apply ? 'updated' : 'would change'}.`,
  );
  if (!apply && changedSlots > 0) console.log('Re-run with --apply to write.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
