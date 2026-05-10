'use client';

import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { FIELD_TYPE_META } from './fieldTypes';
import { FIELD_TYPES } from '@/schemas/slot-fields';
import type { FieldType, SlotFieldConfig } from '@/schemas/slot-fields';
import type { GridField } from './useGridState';
import { validate } from './fieldEditorValidation';

type FieldEditorMode =
  | { mode: 'edit'; field: GridField }
  | { mode: 'create' };

type FieldEditorProps = {
  editorMode: FieldEditorMode;
  onSave: (type: FieldType, name: string, config: SlotFieldConfig, required: boolean) => void;
  onDelete?: () => void;
  onClose: () => void;
};

function buildConfig(type: FieldType, choices: string[]): SlotFieldConfig {
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
      return { fieldType: 'enum', choices };
  }
}

const NAME_INPUT_ID = 'field-name';
const NAME_ERROR_ID = 'field-name-error';
const CHOICES_INPUT_ID = 'field-choices';
const CHOICES_ERROR_ID = 'field-choices-error';

export function FieldEditor({ editorMode, onSave, onDelete, onClose }: FieldEditorProps) {
  const isEdit = editorMode.mode === 'edit';

  const [name, setName] = useState<string>(() => {
    if (editorMode.mode === 'edit') return editorMode.field.name;
    return '';
  });

  const [fieldType, setFieldType] = useState<FieldType>(() => {
    if (editorMode.mode === 'edit') return editorMode.field.type;
    return 'text';
  });

  const [required, setRequired] = useState<boolean>(() => {
    if (editorMode.mode === 'edit') return editorMode.field.required;
    return true;
  });

  const [choicesText, setChoicesText] = useState<string>(() => {
    if (
      editorMode.mode === 'edit' &&
      editorMode.field.config.fieldType === 'enum'
    ) {
      return editorMode.field.config.choices.join('\n');
    }
    return '';
  });

  const [submitted, setSubmitted] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const choicesInputRef = useRef<HTMLTextAreaElement>(null);

  function handleTypeChange(type: FieldType) {
    if (type !== 'enum') {
      setChoicesText('');
    }
    setFieldType(type);
  }

  function handleSave() {
    setSubmitted(true);
    const errors = validate(name, fieldType, choicesText);

    if (errors.name) {
      nameInputRef.current?.focus();
      return;
    }
    if (errors.choices) {
      choicesInputRef.current?.focus();
      return;
    }

    const parsedChoices =
      fieldType === 'enum'
        ? choicesText
            .split('\n')
            .map((c) => c.trim())
            .filter((c) => c.length > 0)
        : [];

    onSave(fieldType, name.trim(), buildConfig(fieldType, parsedChoices), required);
  }

  const errors = submitted ? validate(name, fieldType, choicesText) : {};
  const nameError = errors.name;
  const choicesErrors = errors.choices;

  const titleText = isEdit ? 'Edit column' : 'New column';

  const nameInputClasses = [
    'border rounded-lg px-2.5 py-2 text-sm font-[inherit] outline-none bg-white w-full',
    nameError
      ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger'
      : 'border-surface-sunk focus:border-brand focus:ring-1 focus:ring-brand',
  ].join(' ');

  const choicesInputClasses = [
    'border rounded-lg px-2.5 py-2 text-sm font-[inherit] outline-none bg-white w-full min-h-[80px] resize-y',
    choicesErrors
      ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger'
      : 'border-surface-sunk focus:border-brand focus:ring-1 focus:ring-brand',
  ].join(' ');

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[rgb(11_18_32/0.4)] backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed inset-0 grid place-items-center z-50 p-5">
          <div className="bg-white rounded-2xl p-5 w-[460px] max-w-full shadow-[0_12px_48px_rgb(11_18_32/0.18)]">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <Dialog.Title className="text-base font-semibold text-ink">
                {titleText}
              </Dialog.Title>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-raised transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Form */}
            <div className="flex flex-col gap-4">
              {/* Name input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-ink-soft" htmlFor={NAME_INPUT_ID}>
                  Name <span aria-hidden="true" className="text-danger">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  id={NAME_INPUT_ID}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-required="true"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? NAME_ERROR_ID : undefined}
                  className={nameInputClasses}
                />
                {nameError && (
                  <p id={NAME_ERROR_ID} role="alert" className="text-xs text-danger">
                    {nameError}
                  </p>
                )}
              </div>

              {/* Type pill grid */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-soft">Type</span>
                <div className="grid grid-cols-3 gap-2">
                  {FIELD_TYPES.map((type) => {
                    const meta = FIELD_TYPE_META[type];
                    const Icon = meta.icon;
                    const isActive = fieldType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => handleTypeChange(type)}
                        className={[
                          'flex items-center gap-1.5 text-xs font-medium border rounded-[10px] px-2 py-2 cursor-pointer font-[inherit]',
                          isActive
                            ? 'bg-[rgb(31_111_235/0.10)] text-brand border-brand'
                            : 'bg-white text-ink border-surface-sunk',
                        ].join(' ')}
                      >
                        <Icon size={13} />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Choices textarea (enum only) */}
              {fieldType === 'enum' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-ink-soft" htmlFor={CHOICES_INPUT_ID}>
                    Choices (one per line){' '}
                    <span aria-hidden="true" className="text-danger">*</span>
                  </label>
                  <textarea
                    ref={choicesInputRef}
                    id={CHOICES_INPUT_ID}
                    value={choicesText}
                    onChange={(e) => setChoicesText(e.target.value)}
                    placeholder={'Apples\nBananas\nOranges'}
                    aria-required="true"
                    aria-invalid={choicesErrors ? true : undefined}
                    aria-describedby={choicesErrors ? CHOICES_ERROR_ID : undefined}
                    className={choicesInputClasses}
                  />
                  {choicesErrors && choicesErrors.length === 1 ? (
                    <p
                      id={CHOICES_ERROR_ID}
                      role="alert"
                      className="text-xs text-danger"
                    >
                      {choicesErrors[0]}
                    </p>
                  ) : choicesErrors ? (
                    <ul
                      id={CHOICES_ERROR_ID}
                      role="alert"
                      className="text-xs text-danger flex flex-col gap-0.5"
                    >
                      {choicesErrors.map((msg) => (
                        <li key={msg}>{msg}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}

              {/* Required checkbox */}
              <label className="flex items-center gap-2 cursor-pointer text-sm text-ink">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="rounded"
                />
                Required for every slot
              </label>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-5">
              <div>
                {isEdit && onDelete && (
                  <button
                    onClick={onDelete}
                    className="text-sm text-danger font-medium hover:opacity-70"
                  >
                    Remove column
                  </button>
                )}
              </div>
              <button
                onClick={handleSave}
                className="bg-brand text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand/90 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
