import { slotDetails, type LabelledField } from '@/lib/slot-label';

/**
 * A slot's field values joined into one string, in field order:
 * `Sun, Aug 30 · 13:00 · Front desk`. Unlabelled, for an email subject line,
 * preview text and the organizer's responses table, where the values carry
 * the meaning.
 *
 * Built on `slotDetails()`, so the responses table, the participant page and
 * the emails always agree on which fields a slot has and how each value is
 * rendered.
 *
 * Empty when the slot has no values worth showing. Callers fall back to the
 * signup title, never to `slots.ref` — that is a slugified, collision-suffixed
 * key and has no business in front of a participant.
 */
export function summarizeSlotValues(
  fields: readonly LabelledField[],
  values: Record<string, unknown>,
): string {
  return slotDetails(fields, values)
    .map((d) => d.value)
    .join(' · ');
}
