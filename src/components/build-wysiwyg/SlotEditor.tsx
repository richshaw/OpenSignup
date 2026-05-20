'use client';

import { Check, Copy, Hash, Trash2 } from 'lucide-react';
import { FIELD_TYPE_META } from '../build-grid/fieldTypes';
import { EnumPicker } from './EnumPicker';
import type { GridField, GridRow } from '../build-grid/useGridState';

type SlotEditorProps = {
  row: GridRow;
  fields: GridField[];
  onCellChange: (fieldRef: string, value: string) => void;
  onCapacity: (capacity: number) => void;
  /** Append `value` to the field's enum choices config. Only called for enum cells. */
  onAddEnumOption: (fieldId: string, value: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
};

const TYPE_PLACEHOLDERS: Record<string, string> = {
  text: 'e.g. Bring napkins',
  date: 'YYYY-MM-DD',
  time: 'e.g. 09:00',
  number: 'e.g. 12',
  enum: 'Pick from list',
};

/**
 * Inline accordion editor for a single slot. Auto-fit grid keeps small
 * schemas tight while letting wider schemas wrap naturally; capacity rides
 * along as the trailing cell so it lives in the same visual band.
 */
export function SlotEditor({
  row,
  fields,
  onCellChange,
  onCapacity,
  onAddEnumOption,
  onDuplicate,
  onDelete,
  onClose,
}: SlotEditorProps) {
  return (
    <div className="px-3.5 pb-3.5 pt-3" data-testid={`slot-editor-${row.id}`}>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft">
          Editing slot
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex items-center gap-1 rounded-md border-none bg-transparent px-1.5 py-1 text-[11px] font-medium text-ink-muted hover:bg-surface-raised hover:text-ink"
          >
            <Copy size={11} />
            Duplicate
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-md border-none bg-transparent px-1.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/10"
          >
            <Trash2 size={11} />
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border-none bg-transparent px-1.5 py-1 text-[11px] font-medium text-brand hover:bg-brand-soft"
          >
            <Check size={11} />
            Done
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        {fields.map((f) => {
          const TypeIcon = FIELD_TYPE_META[f.type].icon;
          const isEnum = f.type === 'enum' && f.config.fieldType === 'enum';
          const choices = isEnum && f.config.fieldType === 'enum' ? f.config.choices : [];
          return (
            <label
              key={f.id}
              className="flex flex-col gap-1 text-[11px] text-ink-muted"
            >
              <span className="inline-flex items-center gap-1">
                <TypeIcon size={10} className="text-ink-soft" />
                {f.name}
              </span>
              {isEnum ? (
                <EnumPicker
                  value={row.values[f.ref] ?? ''}
                  options={choices}
                  ariaLabel={`${f.name} value`}
                  onChange={(v) => onCellChange(f.ref, v)}
                  onAddOption={(v) => onAddEnumOption(f.id, v)}
                />
              ) : (
                <input
                  value={row.values[f.ref] ?? ''}
                  placeholder={TYPE_PLACEHOLDERS[f.type] ?? ''}
                  onChange={(e) => onCellChange(f.ref, e.target.value)}
                  className="rounded-md border border-surface-sunk bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
                  aria-label={`${f.name} value`}
                />
              )}
            </label>
          );
        })}
        <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Hash size={10} className="text-ink-soft" />
            Capacity
          </span>
          <input
            type="number"
            min={1}
            value={row.capacity ?? 1}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              onCapacity(Math.max(1, Number.isFinite(parsed) ? parsed : 1));
            }}
            aria-label="Capacity"
            className="w-20 rounded-md border border-surface-sunk bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
          />
        </label>
      </div>
    </div>
  );
}
