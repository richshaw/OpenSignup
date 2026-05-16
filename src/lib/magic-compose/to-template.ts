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

export function magicComposeToTemplate(draft: MagicComposeDraft): SignupTemplate {
  const seenRefs = new Set<string>();
  const fields: SlotFieldInput[] = [];

  draft.fields.forEach((f, i) => {
    if (seenRefs.has(f.ref)) return;
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
      if (!field) continue;
      const enumChoices =
        field.config.fieldType === 'enum' ? field.config.choices : undefined;
      const coerced = coerceValue(field.fieldType, raw, enumChoices);
      if (coerced !== undefined) values[ref] = coerced;
    }
    return {
      values,
      capacity: s.capacity === undefined ? 1 : s.capacity,
      sortOrder: i,
    };
  });

  return {
    id: 'magic-compose',
    fields,
    slots,
  };
}
