import type { SlotFieldInput } from '@/schemas/slot-fields';

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

export const DEFAULT_TEMPLATE: SignupTemplate = {
  id: 'default',
  fields: [
    {
      ref: 'what',
      label: 'What',
      fieldType: 'text',
      sortOrder: 0,
      config: { fieldType: 'text', maxLength: 200 },
    },
    {
      ref: 'date',
      label: 'Date',
      fieldType: 'date',
      sortOrder: 1,
      config: { fieldType: 'date' },
    },
  ],
  slots: [{ capacity: 1, values: {}, sortOrder: 0 }],
};

export const EMPTY_TEMPLATE: SignupTemplate = {
  id: 'empty',
  fields: [],
  slots: [],
};
