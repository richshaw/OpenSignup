import { Type, Calendar, Clock, Hash, List } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MIN_DATE_YEAR, type FieldType } from '@/schemas/slot-fields';

export interface FieldTypeMeta {
  icon: LucideIcon;
  label: string;
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  text: {
    icon: Type,
    label: 'Short text',
  },
  date: {
    icon: Calendar,
    label: 'Date',
  },
  time: {
    icon: Clock,
    label: 'Time',
  },
  number: {
    icon: Hash,
    label: 'Number',
  },
  enum: {
    icon: List,
    label: 'List',
  },
};

/** The input a value of each type is typed into. List values use EnumPicker instead. */
export type FieldValueInput = {
  type: string;
  min?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  placeholder: string;
};

export const FIELD_VALUE_INPUTS: Record<Exclude<FieldType, 'enum'>, FieldValueInput> = {
  text: { type: 'text', placeholder: 'e.g. Bring napkins' },
  // The picker starts where the services do; they refuse an earlier date.
  date: { type: 'date', min: `${MIN_DATE_YEAR}-01-01`, placeholder: 'YYYY-MM-DD' },
  time: { type: 'time', placeholder: 'e.g. 09:00' },
  number: { type: 'number', inputMode: 'numeric', placeholder: 'e.g. 12' },
};
