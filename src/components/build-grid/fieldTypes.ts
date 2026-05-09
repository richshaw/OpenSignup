import { Type, Calendar, Clock, Hash, List } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FieldType } from '@/schemas/slot-fields';

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

/** Returns metadata for a field type; falls back to `text` for unknown types. */
export function fieldTypeMeta(type: FieldType): FieldTypeMeta {
  return FIELD_TYPE_META[type] ?? FIELD_TYPE_META.text;
}
