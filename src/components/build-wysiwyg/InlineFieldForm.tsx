'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { FIELD_TYPE_META } from '../build-grid/fieldTypes';
import { FIELD_TYPES, type FieldType, type SlotFieldConfig } from '@/schemas/slot-fields';
import type { GridField } from '../build-grid/useGridState';

export type InlineFieldFormMode =
  | { mode: 'edit'; field: GridField }
  | { mode: 'create' };

type InlineFieldFormProps = {
  formMode: InlineFieldFormMode;
  onSave: (input: { type: FieldType; name: string; config: SlotFieldConfig }) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

function defaultConfigFor(type: FieldType): SlotFieldConfig {
  switch (type) {
    case 'text':
      return { fieldType: 'text', maxLength: 200 };
    case 'date':
      return { fieldType: 'date' };
    case 'time':
      return { fieldType: 'time' };
    case 'number':
      return { fieldType: 'number' };
    case 'enum':
      // Enum choices are added inline from the slot editor in PR 5; brand-new
      // enum fields seed an empty array so the picker has somewhere to push.
      return { fieldType: 'enum', choices: [] };
  }
}

export function InlineFieldForm({ formMode, onSave, onCancel, onDelete }: InlineFieldFormProps) {
  const isEdit = formMode.mode === 'edit';
  const initialName = isEdit ? formMode.field.name : '';
  const initialType: FieldType = isEdit ? formMode.field.type : 'text';

  const [name, setName] = useState(initialName);
  const [type, setType] = useState<FieldType>(initialType);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const save = () => {
    const trimmed = name.trim() || 'Untitled';
    // When the type changes on an existing field, reset its config to the
    // type's default. The grid's FieldEditor preserves enum choices on edit
    // via a richer flow; we keep things simple here because enum options
    // land via the inline EnumPicker (PR 5), not this form.
    const config: SlotFieldConfig =
      isEdit && formMode.field.type === type
        ? formMode.field.config
        : defaultConfigFor(type);
    onSave({ type, name: trimmed, config });
  };

  return (
    <div>
      <div className="mb-2.5 -mt-1">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back to fields list"
          className="inline-flex h-6 items-center gap-1 rounded-md border-none bg-transparent px-1 text-[11px] font-medium text-ink-muted hover:bg-surface-raised"
        >
          <ArrowLeft size={11} />
          Back
        </button>
      </div>

      <label className="mb-2.5 block">
        <span className="text-[11px] font-medium text-ink-muted">Name</span>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder="e.g. Teacher, Subject, Item"
          aria-label="Field name"
          className="mt-0.5 w-full rounded-md border border-surface-sunk bg-white px-2 py-1 text-xs text-ink outline-none focus:border-brand"
        />
      </label>

      <div className="mb-2.5">
        <span className="text-[11px] font-medium text-ink-muted">Type</span>
        <div className="mt-0.5 grid grid-cols-3 gap-1.5">
          {FIELD_TYPES.map((t) => {
            const TypeIcon = FIELD_TYPE_META[t].icon;
            const active = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={active}
                className={
                  'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors duration-180 ' +
                  (active
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-surface-sunk bg-white text-ink hover:bg-surface-raised')
                }
              >
                <TypeIcon size={10} />
                {FIELD_TYPE_META[t].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="bg-transparent border-none cursor-pointer text-[11px] font-medium text-danger hover:underline"
            >
              Remove field
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-surface-sunk bg-white px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-surface-raised"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-md border border-brand bg-brand px-3 py-1 text-[11px] font-medium text-white hover:bg-brand/90"
          >
            {isEdit ? 'Save' : 'Add field'}
          </button>
        </div>
      </div>
    </div>
  );
}
