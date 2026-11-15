import type { SignupTemplate, SignupTemplateSlot } from '@/lib/signup-templates';
import { isRealDate, isRealTime } from '@/lib/reminder-fields';
import {
  TEXT_DEFAULT_MAX_LENGTH,
  configFor,
  sanitizeEnumChoices,
  type SlotFieldInput,
} from '@/schemas/slot-fields';
import type { DraftWarning } from './draft-warnings';
import type { MagicComposeDraft } from './prompt';

type CoercedValue = string | number;

function coerceValue(
  fieldType: SlotFieldInput['fieldType'],
  raw: unknown,
  enumChoices?: string[],
): CoercedValue | undefined {
  if (raw == null) return undefined;
  switch (fieldType) {
    case 'text': {
      const s = String(raw).trim();
      return s.length === 0 ? undefined : s.slice(0, TEXT_DEFAULT_MAX_LENGTH);
    }
    case 'date': {
      // The services' own check, not just the shape: createSignup refuses the
      // whole draft over a day that doesn't exist or is before `MIN_DATE_YEAR`.
      const s = String(raw).trim();
      return isRealDate(s) ? s : undefined;
    }
    case 'time': {
      const s = String(raw).trim();
      return isRealTime(s) ? s : undefined;
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'enum': {
      const s = String(raw).trim();
      return enumChoices?.includes(s) ? s : undefined;
    }
  }
}

export interface DroppedSummary {
  /** Duplicate field refs (we keep the first; later ones are dropped). */
  duplicateRefs: string[];
  /** Value keys in a slot that don't reference any declared field. */
  strayValueKeys: string[];
  /** Values the model provided that failed type-specific validation. */
  coercionFailures: Array<{
    slot: number;
    ref: string;
    reason: 'date' | 'time' | 'enum' | 'number' | 'text';
  }>;
  /** Enum fields that arrived with no usable choices; demoted to free text. */
  emptyEnumFields: string[];
}

export interface MagicComposeConversion {
  template: SignupTemplate;
  /** Field refs to visually group by in the participant view. Length 0 or 1. */
  groupByFieldRefs: string[];
  /** Per-call telemetry: what the model produced that we adjusted or dropped. */
  dropped: DroppedSummary;
}

/**
 * What the conversion changed, as warnings the build page shows in a banner,
 * each a code with its arguments (see `DraftWarning`), in this order.
 */
export function draftWarnings(dropped: DroppedSummary): DraftWarning[] {
  const out: DraftWarning[] = [];
  if (dropped.coercionFailures.length > 0) {
    out.push({ code: 'values_blanked', count: dropped.coercionFailures.length });
  }
  if (dropped.emptyEnumFields.length > 0) {
    out.push({ code: 'enum_fields_to_text', fields: [...dropped.emptyEnumFields] });
  }
  if (dropped.duplicateRefs.length > 0) {
    out.push({ code: 'duplicate_fields', count: dropped.duplicateRefs.length });
  }
  if (dropped.strayValueKeys.length > 0) {
    out.push({ code: 'stray_values', count: dropped.strayValueKeys.length });
  }
  return out;
}

function hasUsableGrouping(slots: SignupTemplateSlot[], fieldRef: string): boolean {
  const counts = new Map<string, number>();
  for (const s of slots) {
    const raw = s.values[fieldRef];
    if (raw === undefined || raw === null) continue;
    const key = String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const n of counts.values()) if (n >= 2) return true;
  return false;
}

export function magicComposeToTemplate(
  draft: MagicComposeDraft,
  opts: { templateId?: string } = {},
): MagicComposeConversion {
  const seenRefs = new Set<string>();
  const fields: SlotFieldInput[] = [];
  const dropped: DroppedSummary = {
    duplicateRefs: [],
    strayValueKeys: [],
    coercionFailures: [],
    emptyEnumFields: [],
  };

  draft.fields.forEach((f, i) => {
    if (seenRefs.has(f.ref)) {
      dropped.duplicateRefs.push(f.ref);
      return;
    }
    seenRefs.add(f.ref);
    let fieldType = f.fieldType;
    let choices = f.choices;
    if (fieldType === 'enum' && sanitizeEnumChoices(choices).length === 0) {
      dropped.emptyEnumFields.push(f.ref);
      fieldType = 'text';
      choices = undefined;
    }
    const config = configFor(fieldType, choices);
    fields.push({
      ref: f.ref,
      label: f.label,
      fieldType,
      sortOrder: i,
      config,
    });
  });

  const fieldByRef = new Map(fields.map((f) => [f.ref, f] as const));

  const slots: SignupTemplateSlot[] = draft.slots.map((s, i) => {
    const values: Record<string, unknown> = {};
    for (const [ref, raw] of Object.entries(s.values ?? {})) {
      const field = fieldByRef.get(ref);
      if (!field) {
        if (!dropped.strayValueKeys.includes(ref)) dropped.strayValueKeys.push(ref);
        continue;
      }
      const enumChoices = field.config.fieldType === 'enum' ? field.config.choices : undefined;
      const coerced = coerceValue(field.fieldType, raw, enumChoices);
      if (coerced !== undefined) {
        values[ref] = coerced;
      } else if (raw !== undefined && raw !== null && raw !== '') {
        dropped.coercionFailures.push({ slot: i, ref, reason: field.fieldType });
      }
    }
    let capacity: number | null;
    if (s.capacity === null) {
      capacity = null;
    } else if (s.capacity === undefined || s.capacity < 1) {
      capacity = 1;
    } else {
      capacity = s.capacity;
    }
    return { values, capacity, sortOrder: i };
  });

  const template: SignupTemplate = { id: opts.templateId ?? 'magic-compose', fields, slots };

  // Honour the model's groupBy if it points at a declared field. Otherwise
  // fall back: if exactly one enum field exists, group by it (covers the
  // common cross-product case even when the model forgets to set groupBy).
  // Either way, only keep the grouping if it produces at least one group with
  // >1 slot — otherwise the "Group by" pill creates one-item groups that add
  // no scannability and confuse organizers.
  let groupByFieldRefs: string[] = [];
  let candidate: string | undefined;
  if (draft.groupBy && fieldByRef.has(draft.groupBy)) {
    candidate = draft.groupBy;
  } else {
    const enumFields = fields.filter((f) => f.fieldType === 'enum');
    if (enumFields.length === 1) candidate = enumFields[0]!.ref;
  }
  if (candidate && hasUsableGrouping(slots, candidate)) {
    groupByFieldRefs = [candidate];
  }

  return { template, groupByFieldRefs, dropped };
}
