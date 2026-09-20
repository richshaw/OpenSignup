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
  if (capacity === 1) return { text: '', sr: null };
  return { text: `${committed}/${capacity}`, sr: `${committed} of ${capacity} signed up` };
}

/**
 * Shared geometry for a slot row's action slot, so the Sign-up button, the Edit
 * link and the inert Full/Closed label are the same box and the rows keep a
 * common baseline.
 *
 * `w-24` is the design system's canonical action column (96px, contents
 * centred — see design-system/ui_kits/participant/SlotRow.jsx). The app had
 * drifted to right-aligning a content-width action inside it, which made "Full"
 * a narrow label hugging the row's edge while "Sign up" was an 82px pill: two
 * states of one control that did not line up with each other.
 *
 * `min-h-11` is 44px: the old `py-1.5` pill measured 32px tall, under both the
 * iOS HIG 44pt and Material 48dp minimums, in a list whose whole purpose is
 * tapping one row out of many on a phone. It relaxes to a compact 32px from
 * `sm` up, where a pointer is the likely input.
 *
 * Font size stays at each call site: the sizes differ (`text-sm` for the
 * label-bearing actions), and baking one in here would win over a call site's
 * own size regardless of class order, since both sit in the same Tailwind
 * layer.
 *
 * Lives here rather than in signup-view.tsx so the 'use client' commit dialog
 * can share it without importing a server component.
 */
export const ACTION_SIZING =
  'inline-flex w-24 min-h-11 items-center justify-center rounded-lg sm:min-h-8';
