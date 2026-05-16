import type { SignupTemplate, SignupTemplateSlot } from '@/lib/signup-templates';
import type { SlotFieldConfig, SlotFieldInput } from '@/schemas/slot-fields';
import type { MagicComposeDraft } from './prompt';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

function configFor(
  fieldType: SlotFieldInput['fieldType'],
  choices: string[] | undefined,
): SlotFieldConfig {
  switch (fieldType) {
    case 'text':
      return { fieldType: 'text', maxLength: 200 };
    case 'date':
      return { fieldType: 'date' };
    case 'time':
      return { fieldType: 'time' };
    case 'number':
      return { fieldType: 'number' };
    case 'enum': {
      const safeChoices = (choices ?? [])
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
        .slice(0, 20);
      if (safeChoices.length === 0) {
        return { fieldType: 'enum', choices: ['Option 1'] };
      }
      return { fieldType: 'enum', choices: safeChoices };
    }
  }
}

function coerceValue(
  fieldType: SlotFieldInput['fieldType'],
  raw: unknown,
  enumChoices?: string[],
): unknown | undefined {
  if (raw == null) return undefined;
  switch (fieldType) {
    case 'text': {
      const s = String(raw).trim();
      return s.length === 0 ? undefined : s.slice(0, 200);
    }
    case 'date': {
      const s = String(raw).trim();
      return ISO_DATE.test(s) ? s : undefined;
    }
    case 'time': {
      const s = String(raw).trim();
      return HHMM_24H.test(s) ? s : undefined;
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
}

export interface MagicComposeConversion {
  template: SignupTemplate;
  /** Field refs to visually group by in the participant view. Length 0 or 1. */
  groupByFieldRefs: string[];
  /** Per-call telemetry: what the model produced that we silently dropped. */
  dropped: DroppedSummary;
}

export function hasDropped(d: DroppedSummary): boolean {
  return (
    d.duplicateRefs.length > 0 ||
    d.strayValueKeys.length > 0 ||
    d.coercionFailures.length > 0
  );
}

export function magicComposeToTemplate(draft: MagicComposeDraft): MagicComposeConversion {
  const seenRefs = new Set<string>();
  const fields: SlotFieldInput[] = [];
  const dropped: DroppedSummary = {
    duplicateRefs: [],
    strayValueKeys: [],
    coercionFailures: [],
  };

  draft.fields.forEach((f, i) => {
    if (seenRefs.has(f.ref)) {
      dropped.duplicateRefs.push(f.ref);
      return;
    }
    seenRefs.add(f.ref);
    const config = configFor(f.fieldType, f.choices);
    fields.push({
      ref: f.ref,
      label: f.label,
      fieldType: f.fieldType,
      required: f.required ?? false,
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
      const enumChoices =
        field.config.fieldType === 'enum' ? field.config.choices : undefined;
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

  const template: SignupTemplate = { id: 'magic-compose', fields, slots };

  // Honour the model's groupBy if it points at a declared field. Otherwise
  // fall back: if exactly one enum field exists, group by it (covers the
  // common cross-product case even when the model forgets to set groupBy).
  let groupByFieldRefs: string[] = [];
  if (draft.groupBy && fieldByRef.has(draft.groupBy)) {
    groupByFieldRefs = [draft.groupBy];
  } else {
    const enumFields = fields.filter((f) => f.fieldType === 'enum');
    if (enumFields.length === 1) groupByFieldRefs = [enumFields[0]!.ref];
  }

  return { template, groupByFieldRefs, dropped };
}
