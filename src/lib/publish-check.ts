/**
 * The check Publish runs on a draft, read fresh from the database: whether the
 * page would give people nothing to sign up for (which blocks), or still holds
 * placeholder text people would see (a warning the organizer can publish past).
 * Only what the code can prove is reported, and only the first problem, since
 * the panel shows one at a time.
 *
 * Reads the slots and their fields, never the title or description: the slots
 * are what people sign up for. Fields are read in the order given (the services
 * return them by `sortOrder`), slots in display order, and only the values
 * under the signup's own field refs count.
 */

import type { SlotFieldDefinition } from '@/schemas/slot-fields';
import { placeholderIn } from '@/lib/placeholder-text';
import { summarizeSlotValues } from '@/lib/slot-summary';

type PublishCheckField = Pick<SlotFieldDefinition, 'ref' | 'label' | 'fieldType'>;

interface PublishCheckSlot {
  id: string;
  values: Record<string, unknown>;
}

export type PublishCheck =
  /** No slots at all. Blocking. */
  | { kind: 'no_slots' }
  /** No fields, so every slot would show as "Untitled slot". Blocking. */
  | { kind: 'no_fields' }
  /** No slot has a value in any field. Blocking; `slotId` is the first slot. */
  | { kind: 'all_blank'; slotId: string; slotCount: number }
  /**
   * Slots still holding TBD, TBC or TBA, in display order. A warning. `words`
   * are each slot's first one, in capitals, each once, in the order found;
   * `fieldRef` is the field it's in on the first slot, and `slotLabel` that
   * slot's values as the page prints them, less any made only of the words,
   * give or take punctuation ("Sat, Nov 14 · 1:00 PM" for a slot whose What
   * is "TBD", "(TBD)" or "TBD/TBC", but "Cashier TBD · Sat, Nov 14"), or
   * empty when it has none.
   */
  | {
      kind: 'placeholder';
      slotIds: string[];
      words: string[];
      fieldRef: string;
      slotLabel: string;
    };

function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

/**
 * Whether `value` is made only of the words, with nothing but spaces and
 * punctuation round them, such as " tbd ", "(TBD)" or "TBD/TBC", which name
 * nothing; "Cashier TBD" does. Words split where `PLACEHOLDER` sees them end,
 * so "TBD_TBC", which it doesn't count, isn't one.
 */
function isOnlyPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const words = value
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim()
    .split(' ');
  return words.every((word) => placeholderIn(word) === word.toUpperCase());
}

/** The first problem with the slots, blocking ones first, or null when there is none. */
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

  let found: { fieldRef: string; slot: PublishCheckSlot } | null = null;
  const slotIds: string[] = [];
  const words = new Set<string>();
  for (const slot of slots) {
    for (const field of fields) {
      const word = placeholderIn(slot.values[field.ref]);
      if (word === null) continue;
      found ??= { fieldRef: field.ref, slot };
      slotIds.push(slot.id);
      words.add(word);
      break;
    }
  }
  if (!found) return null;

  // The slot is named by its values, less one that is only the word, which
  // the panel quotes itself. A value the word is part of stays: without
  // "Cashier TBD", the label would read as if the date were TBD.
  const { values } = found.slot;
  const others = fields.filter((f) => !isEmpty(values[f.ref]) && !isOnlyPlaceholder(values[f.ref]));
  return {
    kind: 'placeholder',
    slotIds,
    words: [...words],
    fieldRef: found.fieldRef,
    slotLabel: summarizeSlotValues(others, values),
  };
}

const NOTHING_YET = 'Nothing to sign up for yet';
const SEEN = 'People will see that, and a published signup can’t go back to being a draft.';

/** The words the check's panel shows: `fix` is its first button, `secondary` its other one. */
export interface PublishCheckCopy {
  blocking: boolean;
  title: string;
  text: string;
  fix: string | null;
  secondary: string;
}

export function publishCheckCopy(check: PublishCheck): PublishCheckCopy {
  switch (check.kind) {
    case 'no_slots':
      return {
        blocking: true,
        title: NOTHING_YET,
        text: 'There are no slots yet. Add one, then publish.',
        fix: 'Add a slot',
        secondary: 'Not now',
      };
    case 'no_fields':
      return {
        blocking: true,
        title: NOTHING_YET,
        text: 'Add a field that says what people sign up for, then publish.',
        fix: null,
        secondary: 'Not now',
      };
    case 'all_blank':
      return {
        blocking: true,
        title: NOTHING_YET,
        text: `${check.slotCount === 1 ? 'The slot is' : 'Every slot is'} empty. Say what people sign up for, then publish.`,
        fix: 'Fill it in',
        secondary: 'Not now',
      };
    case 'placeholder': {
      const n = check.slotIds.length;
      const says = n === 1 ? `${check.slotLabel || 'One slot'} still says` : `${n} slots still say`;
      const quoted = check.words.map((w) => `“${w}”`);
      const last = quoted.pop();
      const what = quoted.length > 0 ? `${quoted.join(', ')} or ${last}` : last;
      return {
        blocking: false,
        title: 'Before people see it',
        text: `${says} ${what}. ${SEEN}`,
        fix: 'Name it first',
        secondary: 'Publish anyway',
      };
    }
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
  fieldRef: string | null;
}

/**
 * Where the check's fix goes: the slot whose editor it opens (null: add one
 * and open that) and the field it puts focus in (null: the slot's first).
 * Null when there's no fix, as for a signup with no fields.
 */
export function publishCheckTarget(check: PublishCheck): PublishCheckTarget | null {
  switch (check.kind) {
    case 'no_slots':
      return { slotId: null, fieldRef: null };
    case 'no_fields':
      return null;
    case 'all_blank':
      return { slotId: check.slotId, fieldRef: null };
    case 'placeholder': {
      const [first] = check.slotIds;
      return first ? { slotId: first, fieldRef: check.fieldRef } : null;
    }
  }
}
