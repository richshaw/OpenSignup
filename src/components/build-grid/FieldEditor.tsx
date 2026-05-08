'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { FIELD_TYPE_META } from './fieldTypes';
import { FIELD_TYPES } from '@/schemas/slot-fields';
import type { FieldType, SlotFieldConfig } from '@/schemas/slot-fields';
import type { GridField } from './useGridState';

type FieldEditorMode =
  | { mode: 'edit'; field: GridField }
  | { mode: 'create'; type: 'enum' };

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

export function FieldEditor({ editorMode, onSave, onDelete, onClose }: FieldEditorProps) {
  const isEdit = editorMode.mode === 'edit';

  const [name, setName] = useState<string>(() => {
    if (editorMode.mode === 'edit') return editorMode.field.name;
    return FIELD_TYPE_META[editorMode.type].defaultName;
  });

  const [fieldType, setFieldType] = useState<FieldType>(() => {
    if (editorMode.mode === 'edit') return editorMode.field.type;
    return 'enum';
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

  function handleTypeChange(type: FieldType) {
    if (type !== 'enum') {
      setChoicesText('');
    }
    setFieldType(type);
  }

  function handleSave() {
    if (!name.trim()) return;

    let parsedChoices: string[] = [];
    if (fieldType === 'enum') {
      parsedChoices = choicesText
        .split('\n')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (parsedChoices.length === 0) return;
    }

    onSave(fieldType, name.trim(), buildConfig(fieldType, parsedChoices), required);
  }

  const titleText = isEdit ? 'Edit column' : 'New list column';

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
                <label className="text-xs font-medium text-ink-soft" htmlFor="field-name">
                  Name
                </label>
                <input
                  id="field-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border border-surface-sunk rounded-lg px-2.5 py-2 text-sm font-[inherit] outline-none focus:border-brand focus:ring-1 focus:ring-brand bg-white w-full"
                />
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
                  <label className="text-xs font-medium text-ink-soft" htmlFor="field-choices">
                    Choices (one per line)
                  </label>
                  <textarea
                    id="field-choices"
                    value={choicesText}
                    onChange={(e) => setChoicesText(e.target.value)}
                    placeholder={'Apples\nBananas\nOranges'}
                    className="border border-surface-sunk rounded-lg px-2.5 py-2 text-sm font-[inherit] outline-none focus:border-brand focus:ring-1 focus:ring-brand bg-white w-full min-h-[80px] resize-y"
                  />
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
