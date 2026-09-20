import type { SignupViewField, SignupViewSlot } from './signup-view-types';
// Single implementation, shared with the emails so a slot reads the same in
// both places. See src/lib/slot-label.ts.
import { renderFieldValue } from '@/lib/slot-label';

export { formatSlotDate, pickPrimaryField, renderFieldValue } from '@/lib/slot-label';

export function formatGroupLabel(field: SignupViewField, raw: unknown): string {
  return renderFieldValue(field, raw) ?? `(no ${field.label.toLowerCase()})`;
}

export function buildMetaSegments({
  fields,
  slot,
  primaryRef,
  groupRef,
}: {
  fields: readonly SignupViewField[];
  slot: Pick<SignupViewSlot, 'values'>;
  primaryRef?: string | null;
  groupRef?: string | null;
}): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (f.ref === primaryRef) continue;
    if (f.ref === groupRef) continue;
    const formatted = renderFieldValue(f, slot.values[f.ref]);
    if (!formatted) continue;
    out.push(formatted);
  }
  return out;
}

/**
 * What the count column shows for a slot, and what a screen reader hears.
 *
 * The visible string is deliberately empty for the common capacity-1 slot:
 * "0/1" makes a reader decode a fraction to learn "nobody yet", which the
 * Sign-up button (or "Full") already says, and it cost 36px of a 160px-wide
 * text column at 390px. Capacity-1 state lives entirely in the action column.
 *
 * A `null` capacity means unlimited, where a bare "3" has no denominator to
 * anchor it — so it appears only once someone has signed up, and the
 * screen-reader text supplies the missing noun.
 */
export interface CapacityLabel {
  /** Rendered in the count column; an empty string renders nothing at all. */
  text: string;
  /** sr-only sentence, or null when there is nothing worth announcing. */
  sr: string | null;
}

export function capacityLabel(committed: number, capacity: number | null): CapacityLabel {
  if (capacity === null) {
    return committed > 0
      ? { text: String(committed), sr: `${committed} signed up` }
      : { text: '', sr: null };
  }
  // `capacity` is typed `number | null`, so 0 is representable even though
  // CapacitySchema is `.positive()` and no validated write can produce it.
  // Without this it fell through to the fraction branch as a meaningless
  // "0/0"; the expression this replaced rendered a bare "0" for the same row.
  if (capacity <= 1) return { text: '', sr: null };
  return { text: `${committed}/${capacity}`, sr: `${committed} of ${capacity} signed up` };
}

/**
 * Shared geometry for a slot row's action slot, so the Sign-up button, the Edit
 * link and the inert Full/Closed label are the same box and the rows keep a
 * common baseline.
 *
/**
 * Shared geometry for a slot row's action slot, so the Sign-up button, the Edit
 * link and the inert Full/Closed label are the same box and the rows keep a
 * common baseline.
 *
 * On the width, be precise about what is and is not from the design system.
 * design-system/ui_kits/participant/SlotRow.jsx puts `width: 96` on the
 * *wrapper* with `justifyContent: 'center'` and centres a content-width,
 * padded child inside it — so in the kit "Full" is a ~50px label and "Sign up"
 * an ~82px pill, sharing a column but not a width. The kit correctly diagnoses
 * the app's drift (it was `justify-end`, not centred), but making every state
 * the same *width* is a deliberate divergence from it, not something the kit
 * asks for. If the kit is the authority here, this should become a centred
 * wrapper instead and the two should stop disagreeing.
 *
 * `w-20` below `sm`: at 320px a row carrying both a count column and a 96px
 * action leaves ~106px for text and the meta line clips again — the symptom
 * the wrapping fix exists to prevent. 80px fits every label with room (the
 * widest, "Sign up", is ~54px at text-sm) and buys back 16px.
 *
 * `min-h-11` is 44px: the row's actions measured 28-36px depending on which
 * state they were in, all under both the iOS HIG 44pt and Material 48dp
 * minimums, in a list whose whole purpose is tapping one row out of many on a
 * phone. From `sm` up, where a pointer is the likely input, it relaxes to
 * `min-h-9` (36px) — the height the real CommitDialog trigger already was
 * (`px-4 py-2`), so the production button is unchanged on desktop and the
 * Edit link (34px) and Full/Closed label (28px) join it instead of sitting at
 * three different heights.
 *
 * `text-sm` belongs here now that every state uses it. It was left at the call
 * sites while Full/Closed was `text-xs`, because a size baked in here would
 * have beaten a call site's own (same Tailwind layer, source order decides).
 * With one size across all six call sites, holding it here is what stops a
 * seventh call site quietly introducing a seventh size.
 *
 * Lives here rather than in signup-view.tsx so the 'use client' commit dialog
 * can share it without importing a server component.
 */
export const ACTION_SIZING =
  'inline-flex w-20 min-h-11 items-center justify-center rounded-lg text-sm sm:min-h-9 sm:w-24';

/**
 * The accessible name for a slot row's action.
 *
 * `titleFor` alone is not enough. `pickPrimaryField` skips the group field, so
 * on a signup grouped by date the title of every row is its *time*, and eight
 * dates each holding a 09:00 slot give eight buttons called "Sign up for
 * 09:00" — the same collision the aria-label was added to remove. Two
 * ungrouped rows sharing a primary value ("Cookies" at two locations) collide
 * the same way, and an empty primary makes several rows "Untitled slot".
 *
 * The group label and the meta segments are exactly the detail that
 * distinguishes them, and they are already computed for the visible row, so
 * the name is assembled from all three. Commas rather than the visible "·"
 * so a screen reader pauses instead of reading a punctuation character.
 */
export function slotAccessibleName(
  groupLabel: string | null,
  title: string,
  meta: readonly string[],
): string {
  return [groupLabel, title, ...meta].filter((p): p is string => Boolean(p)).join(', ');
}
