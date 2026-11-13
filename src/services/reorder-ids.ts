import { and, eq, sql } from 'drizzle-orm';
import type { Queryable } from '@/db/client';
import { slotFields } from '@/db/schema/slot-fields';
import { slots } from '@/db/schema/slots';
import { serviceError, type ServiceError } from '@/lib/errors';
import { MAX_SORT_ORDER } from '@/schemas/common';

/** The tables whose rows a signup keeps in a `sort_order`: its slots and its fields. */
type OrderedTable = typeof slots | typeof slotFields;

/**
 * The `invalid_input` error for an id list that doesn't name every current id exactly once,
 * or `null` when it does.
 */
export function everyIdOnceError(
  ids: string[],
  currentIds: string[],
  noun: 'slot' | 'field',
): ServiceError | null {
  const known = new Set(currentIds);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) (seen.has(id) ? duplicates : seen).add(id);
  const unknown = [...seen].filter((id) => !known.has(id));
  const missing = currentIds.filter((id) => !seen.has(id));
  if (duplicates.size === 0 && unknown.length === 0 && missing.length === 0) return null;

  const field = `${noun}Ids`;
  return serviceError(
    'invalid_input',
    `${field} must list every ${noun} of the signup exactly once`,
    {
      field,
      details: {
        ...(missing.length > 0 ? { missing } : {}),
        ...(unknown.length > 0 ? { unknown } : {}),
        ...(duplicates.size > 0 ? { duplicates: [...duplicates] } : {}),
      },
      suggestion:
        `call get_signup to see the ids of its ${noun}s, then send every one of them once, ` +
        'in the order you want them shown',
    },
  );
}

/**
 * The order a row appended to a signup's slots or fields takes: past every row
 * it has, and never below how many it has. The caller holds the signup lock.
 *
 * Not max + 1 alone: a REST caller can renumber the rows 0..n-1 by PATCHing
 * `sortOrder` one row at a time, and an add landing between two of those
 * PATCHes reads a max from half-renumbered rows that a later PATCH then
 * writes too. At least the count keeps it clear of 0..n-1. Worked out as a
 * bigint and held at the column's top, where a row sent there would otherwise
 * make every later add fail the insert; past it, appends tie instead.
 */
export async function nextSortOrder(
  tx: Queryable,
  table: OrderedTable,
  signupId: string,
): Promise<number> {
  const [row] = await tx
    .select({
      next: sql<number>`least(
        greatest(coalesce(max(${table.sortOrder}), -1)::bigint + 1, count(*)),
        ${MAX_SORT_ORDER}
      )::int`,
    })
    .from(table)
    .where(eq(table.signupId, signupId));
  return row?.next ?? 0;
}

/**
 * Number a signup's slots or fields 0..n-1 in the order of `orderedIds`,
 * writing only the rows whose order changes. The caller has already passed the
 * policy guard and holds the signup row lock (`lockSignupForWrite`), and
 * `orderedIds` is every row of the signup: a partial list would tie with the
 * rows it leaves out. Slots also stamp `updatedAt`; `slot_fields` has no such
 * column.
 */
export async function writeOrder(
  tx: Queryable,
  table: OrderedTable,
  signupId: string,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  // The ids travel as one JSON parameter: drizzle would spread a JS array into
  // one placeholder per id, and 500 slots is a lot of placeholders.
  const wanted = sql`jsonb_array_elements_text(${JSON.stringify(orderedIds)}::jsonb)
    with ordinality as wanted(id, position)`;
  const sortOrder = sql`(wanted.position - 1)::int`;
  const changed = and(
    eq(table.signupId, signupId),
    sql`${table.id} = wanted.id`,
    sql`${table.sortOrder} <> wanted.position - 1`,
  );
  if (table === slots) {
    await tx.update(slots).set({ sortOrder, updatedAt: new Date() }).from(wanted).where(changed);
  } else {
    await tx.update(slotFields).set({ sortOrder }).from(wanted).where(changed);
  }
}
