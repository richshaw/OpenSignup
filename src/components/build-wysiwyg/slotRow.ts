/**
 * A collapsed slot row's accessible name, which stands in for what the row
 * shows: its first field's value ("Edit slot at 9:00 AM" for a time, "Edit
 * slot — Surfing" otherwise) or, when that's empty, the prompt it shows
 * instead ("Edit slot — Set a date").
 */
export function slotRowLabel({
  anchor,
  time,
  prompt,
}: {
  anchor: string;
  time: boolean;
  prompt: string | null;
}): string {
  return anchor
    ? time
      ? `Edit slot at ${anchor}`
      : `Edit slot — ${anchor}`
    : prompt
      ? `Edit slot — ${prompt}`
      : 'Edit slot';
}
