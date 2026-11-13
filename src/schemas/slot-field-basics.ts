import { toKebab } from '@/lib/kebab';
import type { SlotFieldConfig } from './slot-fields';

// The slot-field constants and helpers the Build tab runs in the browser.
// This module must not import zod (types aside): `slot-fields.ts` builds its
// schemas at the top level, so a client value import from there ships all of
// zod to the browser. `slot-fields.ts` re-exports these for server code.

export const FIELD_TYPES = ['text', 'date', 'time', 'number', 'enum'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const MAX_CHOICES = 20;
export const CHOICE_MAX_LENGTH = 60;
/** The Build tab's list picker shows a new item's character count from this length on. */
export const CHOICE_COUNT_FROM = CHOICE_MAX_LENGTH - 10;
/** A text field's `maxLength` when the organizer hasn't set one. */
export const TEXT_DEFAULT_MAX_LENGTH = 200;

export const REF_MAX_LENGTH = 40;

function cutRef(base: string, maxLength: number): string {
  return base.slice(0, maxLength).replace(/-+$/, '');
}

/**
 * A new field's ref, made from its name: kebab-case, cut to fit `RefSchema`,
 * and numbered (`-2`, `-3`…) when `existingRefs` already has it.
 */
export function toFieldRef(name: string, existingRefs: readonly string[]): string {
  const base = cutRef(toKebab(name), REF_MAX_LENGTH) || 'field';
  if (!existingRefs.includes(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = `-${i}`;
    const ref = `${cutRef(base, REF_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!existingRefs.includes(ref)) return ref;
  }
}

/** A list of enum choices, trimmed, without blanks, and cut to `MAX_CHOICES`. */
export function sanitizeEnumChoices(choices: string[] | undefined): string[] {
  return (choices ?? [])
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .slice(0, MAX_CHOICES);
}

/**
 * A new field's starting config for its type. The Build tab, Magic Compose and
 * the MCP `add_field` tool all create fields through this, so they agree.
 */
export function configFor(fieldType: FieldType, choices: string[] | undefined): SlotFieldConfig {
  switch (fieldType) {
    case 'text':
      return { fieldType: 'text', maxLength: TEXT_DEFAULT_MAX_LENGTH };
    case 'date':
      return { fieldType: 'date' };
    case 'time':
      return { fieldType: 'time' };
    case 'number':
      return { fieldType: 'number' };
    case 'enum':
      return { fieldType: 'enum', choices: sanitizeEnumChoices(choices) };
  }
}
