'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { InlineNote } from '@/components/ui/inline-note';
import { FIELD_TYPE_META } from '../build-shared/fieldTypes';
import { FIELD_TYPES, configFor, type FieldType } from '@/schemas/slot-field-basics';
import type { SlotFieldConfig } from '@/schemas/slot-fields';
import { REMINDER_LEAD_HOURS } from '@/lib/reminder-lead';
import type { BuildField } from '../build-shared/useBuildState';
import { useSignupLanguage } from './signup-language';

export type InlineFieldFormMode = { mode: 'edit'; field: BuildField } | { mode: 'create' };

/**
 * What a saved field gets for what the organizer left unset: the name of a
 * field saved without one, and the option a list field starts with (the
 * server needs at least one). Participants read both, so the page passes them
 * in the signup's language.
 */
export type FieldDefaults = { name: string; firstChoice: string };

type InlineFieldFormProps = {
  formMode: InlineFieldFormMode;
  defaults: FieldDefaults;
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
  /**
   * Leaves out the Back link to the fields list, for a dialog that opened
   * straight on this form and has no list to go back to: Cancel and the
   * dialog's close button end it there.
   */
  hideBack?: boolean;
};

export function InlineFieldForm({
  formMode,
  defaults,
  reminderFieldRef,
  reminderFieldLabel,
  onSave,
  onCancel,
  onDelete,
  hideBack,
}: InlineFieldFormProps) {
  const t = useTranslations('organizer.build');
  const { lang } = useSignupLanguage();
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
  const reminderNoteId = useId();

  // Only one date field per signup carries the reminder. Creating a field
  // never shows the control: the server anchors the first date field itself.
  const showReminder = isEdit && type === 'date';
  const reminderBlocked = reminderFieldRef !== null && reminderFieldRef !== editingRef;

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const save = () => {
    const trimmed = name.trim() || defaults.name;
    // When the type changes on an existing field, reset its config to the
    // type's default. Enum options land via the inline EnumPicker, not here:
    // the server schema requires choices.min(1), so an enum field starts with
    // a placeholder option that the organizer renames (or replaces).
    const config: SlotFieldConfig =
      isEdit && formMode.field.config.fieldType === type
        ? formMode.field.config
        : configFor(type, [defaults.firstChoice]);
    onSave(showReminder ? { name: trimmed, config, reminder } : { name: trimmed, config });
  };

  return (
    <div>
      {!hideBack && (
        <div className="-mt-1 mb-2.5">
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('fieldForm.backLabel')}
            className="inline-flex h-6 items-center gap-1 rounded-md border-none bg-transparent px-1 text-[11px] font-medium text-ink-muted hover:bg-surface-raised"
          >
            <ArrowLeft size={11} />
            {t('fieldForm.back')}
          </button>
        </div>
      )}

      <label className="mb-2.5 block">
        <span className="text-[11px] font-medium text-ink-muted">{t('fieldForm.name')}</span>
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
          placeholder={t('fieldForm.namePlaceholder')}
          aria-label={t('fieldForm.nameLabel')}
          className="mt-0.5 w-full rounded-md border border-surface-sunk bg-white px-2 py-1 text-xs text-ink outline-none focus:border-brand"
        />
      </label>

      <div className="mb-2.5">
        <span className="text-[11px] font-medium text-ink-muted">{t('fieldForm.type')}</span>
        <div className="mt-0.5 grid grid-cols-3 gap-1.5">
          {FIELD_TYPES.map((option) => {
            const TypeIcon = FIELD_TYPE_META[option].icon;
            const active = type === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                aria-pressed={active}
                className={
                  'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors duration-180 ' +
                  (active
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-surface-sunk bg-white text-ink hover:bg-surface-raised')
                }
              >
                <TypeIcon size={10} />
                {t(`fieldType.${option}`)}
              </button>
            );
          })}
        </div>
      </div>

      {showReminder && (
        <div className="mb-2.5 border-t border-surface-sunk pt-2.5">
          <label
            className={
              'flex items-start gap-2 ' +
              (reminderBlocked ? 'cursor-not-allowed opacity-[0.55]' : 'cursor-pointer')
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
              aria-describedby={reminderBlocked ? reminderNoteId : reminderHelpId}
              className="mt-px h-3.5 w-3.5 shrink-0 rounded border-surface-sunk text-brand focus:ring-1 focus:ring-brand disabled:cursor-not-allowed"
            />
            <span className="flex flex-col gap-0.5">
              <span id={reminderTitleId} className="text-[11px] font-medium text-ink">
                {t('fieldForm.reminder')}
              </span>
              {!reminderBlocked && (
                <span id={reminderHelpId} className="text-[11px] leading-[1.35] text-ink-muted">
                  {t('fieldForm.reminderHelp', { hours: REMINDER_LEAD_HOURS })}
                </span>
              )}
            </span>
          </label>
          {reminderBlocked && (
            <InlineNote id={reminderNoteId} className="mt-2">
              {t.rich('fieldForm.reminderTaken', {
                label: reminderFieldLabel ?? '',
                field: (chunks) => (
                  <strong className="font-medium text-ink" lang={lang}>
                    {chunks}
                  </strong>
                ),
              })}
            </InlineNote>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="cursor-pointer border-none bg-transparent text-[11px] font-medium text-danger hover:underline"
            >
              {t('fieldForm.remove')}
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-surface-sunk bg-white px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-surface-raised"
          >
            {t('fieldForm.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-md border border-brand bg-brand px-3 py-1 text-[11px] font-medium text-white hover:bg-brand-hover"
          >
            {isEdit ? t('fieldForm.save') : t('fieldForm.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
