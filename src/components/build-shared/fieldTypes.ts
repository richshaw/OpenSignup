import { Type, Calendar, Clock, Hash, List } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MIN_DATE_YEAR } from '@/lib/reminder-fields';
import type { FieldType, SlotFieldConfig } from '@/schemas/slot-fields';

/** Each field type's icon. Its name is `organizer.build.fieldType.<type>` in the catalog. */
export interface FieldTypeMeta {
  icon: LucideIcon;
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  text: { icon: Type },
  date: { icon: Calendar },
  time: { icon: Clock },
  number: { icon: Hash },
  enum: { icon: List },
};

/** The boxed look of that input, wherever a value is typed into one. */
export const FIELD_VALUE_INPUT_CLASS =
  'rounded-md border border-surface-sunk bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand';

/**
 * The input a value of each type is typed into. List values use EnumPicker and
 * times use TimeSelect instead, so nothing falls back to the browser's time box.
 * Its placeholder is `organizer.build.placeholder.<type>` in the catalog.
 */
export type FieldValueInput = {
  type: string;
  min?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
};

type InputFieldType = Exclude<FieldType, 'enum' | 'time'>;

const FIELD_VALUE_INPUTS: Record<InputFieldType, FieldValueInput> = {
  text: { type: 'text' },
  // The picker starts where the services do; they refuse an earlier date.
  date: { type: 'date', min: `${MIN_DATE_YEAR}-01-01` },
  number: { type: 'number', inputMode: 'numeric' },
};

/**
 * The control a value of `config`'s field is set with, wherever the Build tab
 * sets one (a slot editor's cell, a group's heading), so each can only offer a
 * value the server takes: a List field's choices, the time list for a Time
 * field, else the input for its type, a Text field's held to its length.
 */
export type FieldValueControl =
  | { kind: 'enum'; choices: string[] }
  | { kind: 'time' }
  | { kind: 'input'; fieldType: InputFieldType; input: FieldValueInput };

export function fieldValueControl(config: SlotFieldConfig): FieldValueControl {
  switch (config.fieldType) {
    case 'enum':
      return { kind: 'enum', choices: config.choices };
    case 'time':
      return { kind: 'time' };
    case 'text':
      return {
        kind: 'input',
        fieldType: 'text',
        input: { ...FIELD_VALUE_INPUTS.text, maxLength: config.maxLength },
      };
    default:
      return {
        kind: 'input',
        fieldType: config.fieldType,
        input: FIELD_VALUE_INPUTS[config.fieldType],
      };
  }
}
