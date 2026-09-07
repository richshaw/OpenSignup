/**
 * One-off repair for reminder anchoring. Run once, at deploy.
 *
 * Two passes, in order:
 *
 * 1. PIN. Anchor resolution used to refuse to choose between two or more date
 *    fields, so those signups had every slot_at NULL — except slots created
 *    *before* the second date field was added, which kept a working value
 *    because nothing recomputed. Resolution is total now, and the anchor is the
 *    first date field in (sortOrder, ref) order. On rows created while the input
 *    schema defaulted an omitted sortOrder to 0, a date column added from the
 *    build page sits at 0, ahead of the template's date field at 1 — so the
 *    anchor would move to the added, empty column and the recompute in pass 2
 *    would wipe those still-working values. This pass pins
 *    `reminderFromFieldRef` to whichever date field actually produced the
 *    stored slot_at, so the signup keeps anchoring where it already does.
 *
 *    Only signups with 2+ date fields, no explicit ref, and at least one
 *    non-null slot_at are touched. Everything else is left to auto-resolve.
 *
 * 2. RECOMPUTE. Rebuild slot_at everywhere. Picks up signups stranded NULL by
 *    the old refuse-to-choose rule, and rows left stale by addField/updateField
 *    never having recomputed.
 *
 * Written as a script rather than a SQL migration on purpose: the resolution
 * rule lives in `findReminderFields`, and a migration reimplementing it in SQL
 * would be a second copy to drift from the first. This calls the real one.
 *
 * Safe to re-run. Pass 1 skips signups that already carry an explicit ref, and
 * `recomputeSlotAtForSignup` compares before writing.
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
import type { SlotFieldDefinition } from '@/schemas/slot-fields';

interface SlotRow {
  id: string;
  values: unknown;
  slotAt: Date | null;
}

/**
 * The date field whose values reproduce the stored slot_at on the most slots.
 *
 * Returns null when nothing matches — there is then no current behaviour worth
 * preserving, so the signup is left to auto-resolve.
 */
function anchorInUse(
  settings: Record<string, unknown>,
  fields: SlotFieldDefinition[],
  dateFields: SlotFieldDefinition[],
  slotRows: SlotRow[],
): SlotFieldDefinition | null {
  let best: { field: SlotFieldDefinition; hits: number } | null = null;

  for (const candidate of dateFields) {
    let hits = 0;
    for (const slot of slotRows) {
      if (!slot.slotAt) continue;
      const asIf = extractSlotAt(
        { ...settings, reminderFromFieldRef: candidate.ref },
        fields,
        (slot.values as Record<string, unknown>) ?? {},
      );
      if (asIf && asIf.getTime() === slot.slotAt.getTime()) hits++;
    }
    if (hits > 0 && (!best || hits > best.hits)) best = { field: candidate, hits };
  }

  return best?.field ?? null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const db = getDb();

  const rows = await db
    .select({ id: signups.id, title: signups.title, settings: signups.settings })
    .from(signups)
    .where(isNull(signups.deletedAt))
    .orderBy(asc(signups.createdAt));

  console.log(`${rows.length} signup(s) to check${apply ? '' : ' (dry run)'}\n`);

  let pinned = 0;
  let changedSignups = 0;
  let changedSlots = 0;

  console.log('Pass 1 — pin the anchor where two or more date fields compete');
  for (const signup of rows) {
    const settings = (signup.settings as Record<string, unknown>) ?? {};
    if (typeof settings.reminderFromFieldRef === 'string' && settings.reminderFromFieldRef) continue;

    const fields = await listFieldsForSignup(db, signup.id);
    const dateFields = fields.filter((f) => f.fieldType === 'date');
    if (dateFields.length < 2) continue;

    const slotRows: SlotRow[] = await db
      .select({ id: slots.id, values: slots.values, slotAt: slots.slotAt })
      .from(slots)
      .where(eq(slots.signupId, signup.id));
    if (!slotRows.some((s) => s.slotAt)) continue;

    const inUse = anchorInUse(settings, fields, dateFields, slotRows);
    if (!inUse) continue;

    // Already what auto-resolution would choose — no need to pin it.
    const sorted = [...dateFields].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.ref.localeCompare(b.ref),
    );
    if (sorted[0]?.ref === inUse.ref) continue;

    pinned++;
    console.log(`  ${signup.id}  pin "${inUse.ref}" (auto would pick "${sorted[0]?.ref}")  ${signup.title}`);
    if (apply) {
      await db
        .update(signups)
        .set({ settings: { ...settings, reminderFromFieldRef: inUse.ref }, updatedAt: new Date() })
        .where(eq(signups.id, signup.id));
    }
  }
  console.log(`  ${pinned} signup(s) ${apply ? 'pinned' : 'would be pinned'}\n`);

  console.log('Pass 2 — rebuild slot_at');
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

    // Dry run: the same comparison recomputeSlotAtForSignup makes, without the
    // write. Reads settings from the database, so it reflects pass 1 only once
    // pass 1 has actually been applied.
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
    `  ${changedSlots} slot(s) across ${changedSignups} signup(s) ${apply ? 'updated' : 'would change'}`,
  );
  if (!apply) console.log('\nRe-run with --apply to write.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
