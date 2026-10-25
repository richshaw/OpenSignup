import { placeholderIn } from '@/lib/placeholder-text';
import type { SignupStatus } from '@/schemas/signups';

/**
 * The tag on a slot row whose values still hold TBD, TBC or TBA, by the test
 * Publish's check uses, naming the first one in the fields' order: "Still
 * says “TBD”" on a draft; "People can see “TBD”" once people can open the
 * page, while it's open or closed (an archived signup shows them none of it).
 * Null when the slot holds none.
 */
export function placeholderMark(
  values: Record<string, unknown>,
  fields: readonly { ref: string }[],
  status: SignupStatus,
): string | null {
  for (const { ref } of fields) {
    const word = placeholderIn(values[ref]);
    if (word) {
      return status === 'open' || status === 'closed'
        ? `People can see “${word}”`
        : `Still says “${word}”`;
    }
  }
  return null;
}

/**
 * A collapsed slot row's accessible name, which stands in for what the row
 * shows: its first field's value ("Edit slot at 9:00 AM" for a time, "Edit
 * slot — Surfing" otherwise) or, when that's empty, the prompt it shows
 * instead ("Edit slot — Set a date"), then its tag, if it has one ("…, still
 * says “TBD”").
 */
export function slotRowLabel({
  anchor,
  time,
  prompt,
  mark,
}: {
  anchor: string;
  time: boolean;
  prompt: string | null;
  mark: string | null;
}): string {
  const label = anchor
    ? time
      ? `Edit slot at ${anchor}`
      : `Edit slot — ${anchor}`
    : prompt
      ? `Edit slot — ${prompt}`
      : 'Edit slot';
  return mark ? `${label}, ${mark.charAt(0).toLowerCase()}${mark.slice(1)}` : label;
}
