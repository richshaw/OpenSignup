'use client';

import { Plus } from 'lucide-react';
import { FIELD_TYPE_META } from '../fieldTypes';
import type { GridField } from '../useGridState';

type FieldChipStripProps = {
  fields: GridField[];
  onEditField: (field: GridField) => void;
  onAddField: () => void;
};

export function FieldChipStrip({ fields, onEditField, onAddField }: FieldChipStripProps) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-1.5">
        {fields.map((field) => {
          const Icon = FIELD_TYPE_META[field.type].icon;
          return (
            <button
              key={field.id}
              type="button"
              onClick={() => onEditField(field)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-surface-sunk bg-white px-3 py-1.5 text-sm text-ink"
            >
              <Icon size={13} className="text-brand" aria-hidden="true" />
              <span className="truncate max-w-[160px]">{field.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAddField}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-brand-soft bg-white px-3 py-1.5 text-sm font-medium text-brand"
        >
          <Plus size={13} aria-hidden="true" />
          Add field
        </button>
      </div>
    </div>
  );
}
