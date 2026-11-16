import { Type, Calendar, Clock, Hash, List } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MIN_DATE_YEAR } from '@/lib/reminder-fields';
import type { FieldType } from '@/schemas/slot-fields';

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
};

export const FIELD_VALUE_INPUTS: Record<Exclude<FieldType, 'enum' | 'time'>, FieldValueInput> = {
  text: { type: 'text' },
  // The picker starts where the services do; they refuse an earlier date.
  date: { type: 'date', min: `${MIN_DATE_YEAR}-01-01` },
  number: { type: 'number', inputMode: 'numeric' },
};
