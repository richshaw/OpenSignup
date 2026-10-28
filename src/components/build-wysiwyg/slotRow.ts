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
 * it, so each says which slot it's for.
 */
function slotName({ anchor, time, prompt }: SlotNameParts): string {
  return anchor
    ? time
      ? `slot at ${anchor}`
      : `slot — ${anchor}`
    : prompt
      ? `slot — ${prompt}`
      : 'slot';
}

/** The names of a collapsed row's toolbar buttons and of its open editor. */
export function slotActionLabels(parts: SlotNameParts): {
  edit: string;
  duplicate: string;
  delete: string;
  editing: string;
} {
  const name = slotName(parts);
  return {
    edit: `Edit ${name}`,
    duplicate: `Duplicate ${name}`,
    delete: `Delete ${name}`,
    editing: `Editing ${name}`,
  };
}

/**
 * A collapsed slot row's accessible name: "Edit" and the slot's name, then the
 * spots taken the row shows ("0 of 6 taken").
 */
export function slotRowLabel({ count, ...parts }: SlotNameParts & { count: string }): string {
  return `Edit ${slotName(parts)}, ${count}`;
}

/** The spots a slot row says are taken: "2 of 6 taken", or "2 taken" with no limit. */
export function takenText(taken: number, capacity: number | null): string {
  return capacity === null ? `${taken} taken` : `${taken} of ${capacity} taken`;
}
