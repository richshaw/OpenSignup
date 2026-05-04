import type { SlotFieldDefinition } from '@/schemas/slot-fields';

/**
 * Produces a human-readable summary string for a slot's field values.
 * Skips null/undefined/empty values; joins present ones with " · ".
 */
export function summarizeSlot(
  fields: SlotFieldDefinition[],
  values: Record<string, unknown>,
): string {
  const parts: string[] = [];
  for (const f of fields) {
    const v = values[f.ref];
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${f.label}: ${String(v)}`);
  }
  return parts.join(' · ');
}
