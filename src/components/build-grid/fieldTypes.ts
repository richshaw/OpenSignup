import { Type, Calendar, Clock, Hash, List } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FieldType } from '@/schemas/slot-fields';

export interface FieldTypeMeta {
  icon: LucideIcon;
  label: string;
  placeholder: string;
  /** Default column name shown when the user adds this field type. */
  defaultName: string;
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  text: {
    icon: Type,
    label: 'Short text',
    placeholder: 'e.g. vs Hawks',
    defaultName: 'Name',
  },
  date: {
    icon: Calendar,
    label: 'Date',
    placeholder: 'Date',
    defaultName: 'Date',
  },
  time: {
    icon: Clock,
    label: 'Time',
    placeholder: 'Time',
    defaultName: 'Time',
  },
  number: {
    icon: Hash,
    label: 'Number',
    placeholder: '0',
    defaultName: 'Quantity',
  },
  enum: {
    icon: List,
    label: 'List',
    placeholder: 'Choose…',
    defaultName: 'Choice',
  },
};

/** Returns metadata for a field type; falls back to `text` for unknown types. */
export function fieldTypeMeta(type: FieldType): FieldTypeMeta {
  return FIELD_TYPE_META[type] ?? FIELD_TYPE_META.text;
}
