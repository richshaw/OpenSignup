import type { Translator } from '@/i18n/translator';

type SlotNameParts = {
  anchor: string;
  time: boolean;
  prompt: string | null;
};

/**
 * How the Build tab names a slot, which stands in for what its row shows: its
 * first field's value ("slot at 9:00 AM" for a time, "slot — Surfing"
 * otherwise) or, when that's empty, the prompt it shows instead ("slot — Set a
 * date"). The row, its toolbar's buttons and its open editor all start from
 * it, so each says which slot it's for. Each of their messages holds the name
 * whole, as a `select` on `kind` with the value as `name`, so a language can
 * word the name to suit what's done to it.
 */
function slotName({ anchor, time, prompt }: SlotNameParts) {
  if (anchor) return { kind: time ? 'time' : 'named', name: anchor };
  return prompt ? { kind: 'named', name: prompt } : { kind: 'none', name: '' };
}

/** The names of a collapsed row's toolbar buttons and of its open editor. */
export function slotActionLabels(
  t: Translator<'organizer.build'>,
  parts: SlotNameParts,
): {
  edit: string;
  duplicate: string;
  delete: string;
  editing: string;
} {
  const name = slotName(parts);
  return {
    edit: t('slot.edit', name),
    duplicate: t('slot.duplicate', name),
    delete: t('slot.delete', name),
    editing: t('slot.editing', name),
  };
}

/**
 * A collapsed slot row's accessible name: "Edit" and the slot's name, then the
 * spots taken the row shows ("0 of 6 taken").
 */
export function slotRowLabel(
  t: Translator<'organizer.build'>,
  { count, ...parts }: SlotNameParts & { count: string },
): string {
  return t('slot.row', { ...slotName(parts), count });
}

/** The spots a slot row says are taken: "2 of 6 taken", or "2 taken" with no limit. */
export function takenText(
  t: Translator<'organizer.build'>,
  taken: number,
  capacity: number | null,
): string {
  return capacity === null ? t('slot.taken', { taken }) : t('slot.takenOf', { taken, capacity });
}

/**
 * The slot a slot swaps places with when it moves `direction` in its group:
 * the one just before or after it in `groupRows`, or null at that end. Moves
 * stay inside the group, since crossing into the next day would also change
 * the slot's date.
 */
export function neighborInGroup(
  groupRows: readonly { id: string }[],
  rowId: string,
  direction: 'up' | 'down',
): string | null {
  const idx = groupRows.findIndex((r) => r.id === rowId);
  if (idx < 0) return null;
  return groupRows[direction === 'up' ? idx - 1 : idx + 1]?.id ?? null;
}
