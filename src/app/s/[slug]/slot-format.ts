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
