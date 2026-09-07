'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { FIELD_TYPE_META } from '../build-grid/fieldTypes';
import { FIELD_TYPES, type FieldType, type SlotFieldConfig } from '@/schemas/slot-fields';
import type { GridField } from '../build-grid/useGridState';

export type InlineFieldFormMode =
  | { mode: 'edit'; field: GridField }
  | { mode: 'create' };

type InlineFieldFormProps = {
  formMode: InlineFieldFormMode;
  /** Ref of the field reminders are sent for, or null when they are off. */
  reminderFieldRef: string | null;
  /** Label of that field, for telling the organizer which one holds the reminder. */
  reminderFieldLabel: string | null;
  /**
   * `reminder` is present only when editing a field whose (current) type is
   * date: whether this field should be the one reminders are sent for.
   */
  onSave: (input: { name: string; config: SlotFieldConfig; reminder?: boolean }) => void;
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
      // Server schema requires choices.min(1); seed a placeholder option that
      // the organizer renames (or replaces) via the inline EnumPicker.
      return { fieldType: 'enum', choices: ['Option 1'] };
  }
}

export function InlineFieldForm({
  formMode,
  reminderFieldRef,
  reminderFieldLabel,
  onSave,
  onCancel,
  onDelete,
}: InlineFieldFormProps) {
  const isEdit = formMode.mode === 'edit';
  const initialName = isEdit ? formMode.field.name : '';
  const initialType: FieldType = isEdit ? formMode.field.config.fieldType : 'text';
  const editingRef = isEdit ? formMode.field.ref : null;

  const [name, setName] = useState(initialName);
  const [type, setType] = useState<FieldType>(initialType);
  const [reminder, setReminder] = useState(isEdit && reminderFieldRef === editingRef);
  const nameRef = useRef<HTMLInputElement>(null);
  const reminderTitleId = useId();
  const reminderHelpId = useId();

  // Only one date field per signup carries the reminder. Creating a field
  // never shows the control: the server anchors the first date field itself.
  const showReminder = isEdit && type === 'date';
  const reminderBlocked = reminderFieldRef !== null && reminderFieldRef !== editingRef;

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const save = () => {
    const trimmed = name.trim() || 'Untitled';
    // When the type changes on an existing field, reset its config to the
    // type's default. Enum options land via the inline EnumPicker, not here.
    const config: SlotFieldConfig =
      isEdit && formMode.field.config.fieldType === type
        ? formMode.field.config
        : defaultConfigFor(type);
    onSave(showReminder ? { name: trimmed, config, reminder } : { name: trimmed, config });
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

      {showReminder && (
        <div className="border-t border-surface-sunk pt-2.5 mb-2.5">
          <label
            className={
              'flex items-start gap-2 ' +
              (reminderBlocked ? 'opacity-[0.55] cursor-not-allowed' : 'cursor-pointer')
            }
          >
            {/*
              Named by the title alone; the helper is a description. Left to
              the wrapping label, the checkbox's name would be both sentences.
            */}
            <input
              type="checkbox"
              checked={reminder}
              disabled={reminderBlocked}
              onChange={(e) => setReminder(e.target.checked)}
              aria-labelledby={reminderTitleId}
              aria-describedby={reminderBlocked ? undefined : reminderHelpId}
              className="mt-px h-3.5 w-3.5 shrink-0 rounded border-surface-sunk text-brand focus:ring-1 focus:ring-brand disabled:cursor-not-allowed"
            />
            <span className="flex flex-col gap-0.5">
              <span id={reminderTitleId} className="text-[11px] font-medium text-ink">
                Send a reminder email before this date
              </span>
              {!reminderBlocked && (
                <span id={reminderHelpId} className="text-[11px] leading-[1.35] text-ink-muted">
                  Sent the day before. One date field per signup drives reminders, and
                  participants can opt out of any reminder they get.
                </span>
              )}
            </span>
          </label>
          {reminderBlocked && (
            <div
              role="note"
              className="mt-2 flex items-start gap-1.5 rounded-md bg-brand/10 px-2.5 py-2 text-[11px] leading-[1.35] text-ink-muted"
            >
              <Info size={12} className="mt-px shrink-0 text-brand" aria-hidden="true" />
              <span>
                <strong className="font-medium text-ink">{reminderFieldLabel}</strong> is already
                the reminder field for this signup. Turn it off there to use this one instead.
              </span>
            </div>
          )}
        </div>
      )}

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
