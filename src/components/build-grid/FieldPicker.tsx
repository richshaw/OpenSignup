'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { FIELD_TYPE_META } from './fieldTypes';
import { FIELD_TYPES } from '@/schemas/slot-fields';
import type { FieldType } from '@/schemas/slot-fields';

type FieldPickerProps = {
  onPick: (type: Exclude<FieldType, 'enum'>) => void;
  onPickEnum: () => void;
  onClose: () => void;
};

export function FieldPicker({ onPick, onPickEnum, onClose }: FieldPickerProps) {
  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[rgb(11_18_32/0.4)] backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed inset-0 grid place-items-center z-50 p-5">
          <div className="bg-white rounded-2xl p-5 w-[460px] max-w-full shadow-[0_12px_48px_rgb(11_18_32/0.18)]">
            <div className="flex items-start justify-between mb-1">
              <Dialog.Title className="text-base font-semibold text-ink">
                What does this column track?
              </Dialog.Title>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-raised transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <Dialog.Description className="text-sm text-ink-muted mb-3.5">
              Pick a type — we&apos;ll set the right input.
            </Dialog.Description>
            <div className="grid grid-cols-3 gap-2">
              {FIELD_TYPES.map((type) => {
                const meta = FIELD_TYPE_META[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      if (type === 'enum') {
                        onPickEnum();
                      } else {
                        onPick(type as Exclude<FieldType, 'enum'>);
                      }
                    }}
                    className="bg-white border border-surface-sunk rounded-xl p-3 flex flex-col items-start gap-1.5 cursor-pointer text-left font-[inherit] hover:border-brand hover:bg-surface-raised transition-colors"
                  >
                    <Icon size={18} className="text-brand" />
                    <span className="text-sm font-semibold text-ink">{meta.label}</span>
                    <span className="text-xs text-ink-soft">{meta.placeholder}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
