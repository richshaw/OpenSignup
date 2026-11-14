import type { Translator } from '@/i18n/translator';
import { TEXT_DEFAULT_MAX_LENGTH, type SlotFieldInput } from '@/schemas/slot-fields';

export interface SignupTemplateSlot {
  capacity: number | null;
  values: Record<string, unknown>;
  sortOrder?: number;
}

export interface SignupTemplate {
  id: string;
  fields: SlotFieldInput[];
  slots: SignupTemplateSlot[];
}

/**
 * What a signup starts with when its maker gives no template (the New signup
 * form and `POST /api/signups`): a text column and a date column, and one
 * empty slot. Participants read the columns' names, so they come from `t`, in
 * the signup's language ("What" and "Date" in English). Their refs stay
 * `what` and `date` in every language: refs are identifiers, which slot
 * values, the API, tests and the AI connector's instructions use.
 */
export function defaultTemplate(t: Translator<'participant.defaults'>): SignupTemplate {
  return {
    id: 'default',
    fields: [
      {
        ref: 'what',
        label: t('what'),
        fieldType: 'text',
        sortOrder: 0,
        config: { fieldType: 'text', maxLength: TEXT_DEFAULT_MAX_LENGTH },
      },
      {
        ref: 'date',
        label: t('date'),
        fieldType: 'date',
        sortOrder: 1,
        config: { fieldType: 'date' },
      },
    ],
    slots: [{ capacity: 1, values: {}, sortOrder: 0 }],
  };
}
