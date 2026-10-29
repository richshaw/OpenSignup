/**
 * The check Publish runs on a draft, read fresh from the database: whether the
 * page would give people nothing to sign up for. Any problem it finds blocks
 * the publish. Only what the code can prove is reported, and only the first
 * problem, since the panel shows one at a time.
 *
 * Reads the slots and their fields, never the title or description: the slots
 * are what people sign up for. Only the values under the signup's own field
 * refs count.
 */

import type { SlotFieldDefinition } from '@/schemas/slot-fields';

type PublishCheckField = Pick<SlotFieldDefinition, 'ref'>;

interface PublishCheckSlot {
  id: string;
  values: Record<string, unknown>;
}

export type PublishCheck =
  /** No slots at all. */
  | { kind: 'no_slots' }
  /** No fields, so every slot would show as "Untitled slot". */
  | { kind: 'no_fields' }
  /** No slot has a value in any field. `slotId` is the first slot. */
  | { kind: 'all_blank'; slotId: string; slotCount: number };

function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

/** The first problem with the slots, or null when there is none. */
export function checkBeforePublish({
  fields,
  slots,
}: {
  fields: readonly PublishCheckField[];
  slots: readonly PublishCheckSlot[];
}): PublishCheck | null {
  const first = slots[0];
  if (!first) return { kind: 'no_slots' };
  if (fields.length === 0) return { kind: 'no_fields' };
  if (slots.every((s) => fields.every((f) => isEmpty(s.values[f.ref])))) {
    return { kind: 'all_blank', slotId: first.id, slotCount: slots.length };
  }
  return null;
}

const NOTHING_YET = 'Nothing to sign up for yet';

/** The words the check's panel shows: `fix` is its first button, `secondary` its other one. */
export interface PublishCheckCopy {
  title: string;
  text: string;
  fix: string | null;
  secondary: string;
}

export function publishCheckCopy(check: PublishCheck): PublishCheckCopy {
  switch (check.kind) {
    case 'no_slots':
      return {
        title: NOTHING_YET,
        text: 'There are no slots yet. Add one, then publish.',
        fix: 'Add a slot',
        secondary: 'Not now',
      };
    case 'no_fields':
      return {
        title: NOTHING_YET,
        text: 'Add a field that says what people sign up for, then publish.',
        fix: null,
        secondary: 'Not now',
      };
    case 'all_blank':
      return {
        title: NOTHING_YET,
        text: `${check.slotCount === 1 ? 'The slot is' : 'Every slot is'} empty. Say what people sign up for, then publish.`,
        fix: 'Fill it in',
        secondary: 'Not now',
      };
  }
}

/**
 * What Publish answers with when its check finds something: the problem, the
 * words its panel shows, and where its fix goes, all worked out on the server.
 */
export interface PublishCheckAnswer {
  check: PublishCheck;
  copy: PublishCheckCopy;
  target: PublishCheckTarget | null;
}

interface PublishCheckTarget {
  slotId: string | null;
}

/**
 * Where the check's fix goes: the slot whose editor it opens, with focus in
 * its first field (null: add one and open that). Null when there's no fix,
 * as for a signup with no fields.
 */
export function publishCheckTarget(check: PublishCheck): PublishCheckTarget | null {
  switch (check.kind) {
    case 'no_slots':
      return { slotId: null };
    case 'no_fields':
      return null;
    case 'all_blank':
      return { slotId: check.slotId };
  }
}
