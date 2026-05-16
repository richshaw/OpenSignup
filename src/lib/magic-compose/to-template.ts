import type { SignupTemplate, SignupTemplateSlot } from '@/lib/signup-templates';
import type { SlotFieldConfig, SlotFieldInput } from '@/schemas/slot-fields';
import type { MagicComposeDraft } from './prompt';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

function sanitizeEnumChoices(choices: string[] | undefined): string[] {
  return (choices ?? [])
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .slice(0, 20);
}

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
    case 'enum':
      return { fieldType: 'enum', choices: sanitizeEnumChoices(choices) };
  }
}

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

export function hasDropped(d: DroppedSummary): boolean {
  return (
    d.duplicateRefs.length > 0 ||
    d.strayValueKeys.length > 0 ||
    d.coercionFailures.length > 0 ||
    d.emptyEnumFields.length > 0
  );
}

/** Build short user-facing warnings the build page can surface in a banner. */
export function buildWarnings(dropped: DroppedSummary): string[] {
  const out: string[] = [];
  if (dropped.coercionFailures.length > 0) {
    const n = dropped.coercionFailures.length;
    out.push(
      `${n} ${n === 1 ? 'cell was' : 'cells were'} left blank because the AI's value didn't match the column's format. Fill them in below.`,
    );
  }
  if (dropped.emptyEnumFields.length > 0) {
    const labels = dropped.emptyEnumFields.join(', ');
    out.push(
      `Column${dropped.emptyEnumFields.length === 1 ? '' : 's'} ${labels} arrived without a fixed list of options, so ${dropped.emptyEnumFields.length === 1 ? 'it was' : 'they were'} switched to free text.`,
    );
  }
  if (dropped.duplicateRefs.length > 0) {
    out.push(
      `Removed ${dropped.duplicateRefs.length} duplicate column${dropped.duplicateRefs.length === 1 ? '' : 's'} the AI tried to add twice.`,
    );
  }
  if (dropped.strayValueKeys.length > 0) {
    out.push(
      `Ignored ${dropped.strayValueKeys.length} stray value${dropped.strayValueKeys.length === 1 ? '' : 's'} that didn't match any column.`,
    );
  }
  return out;
}

export function magicComposeToTemplate(draft: MagicComposeDraft): MagicComposeConversion {
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
