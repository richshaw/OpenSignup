'use client';

import { useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { PickerOption } from './PickerOption';
import { useOutsideClose } from './useOutsideClose';

type EnumPickerProps = {
  value: string;
  options: string[];
  ariaLabel: string;
  onChange: (next: string) => void;
  /**
   * Called when the user adds a brand-new option from inside the picker.
   * Implementations should append the value to the field's `choices` config.
   * May return a promise; the picker awaits it before committing the cell
   * value so the field-config PATCH always lands before the slot PATCH that
   * sets the new value (otherwise the server can see a value that is not yet
   * in `choices` and reject it as `invalid_input`).
   */
  onAddOption: (value: string) => void | Promise<void>;
  /** Shown when nothing is chosen. */
  placeholder?: string;
  /**
   * Replaces the slot editor's boxed look, for a picker set inline in text (a
   * group header); its menu then sets its own width.
   */
  triggerClassName?: string;
};

/**
 * Single-select dropdown with an inline "+ Add to list" footer. Designed to
 * replace the bare `<input>` for enum fields in SlotEditor — list options
 * grow as organizers fill in values, instead of needing a separate schema
 * trip.
 */
export function EnumPicker({
  value,
  options,
  ariaLabel,
  onChange,
  onAddOption,
  placeholder = 'Choose\u2026',
  triggerClassName,
}: EnumPickerProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Prevents Enter committing and then the unmount-triggered onBlur committing
  // a second time (which would call onAddOption twice).
  const settledRef = useRef(false);

  const close = () => {
    // Mark settled so any blur fired during unmount (Escape, click-outside)
    // doesn't fall into commitNew and add the draft as a new option.
    settledRef.current = true;
    setOpen(false);
    setAdding(false);
    setDraft('');
  };

  useOutsideClose(open, [menuRef, triggerRef], close);

  const startAdding = () => {
    settledRef.current = false;
    setAdding(true);
  };

  const commitNew = async () => {
    if (settledRef.current) return;
    settledRef.current = true;
    const v = draft.trim();
    // Close the picker first so the UI stays snappy while the field PATCH is
    // in flight. `onAddOption` may persist asynchronously; we await it before
    // calling `onChange` so the cell value commit can never race the field's
    // `choices` update on slow networks.
    setOpen(false);
    setAdding(false);
    setDraft('');
    if (v) {
      await onAddOption(v);
      onChange(v);
    }
  };

  return (
    <div className={triggerClassName ? 'relative inline-block' : 'relative'} data-testid="enum-picker">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={
          triggerClassName ??
          'flex w-full items-center justify-between gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-left text-[13px] outline-none ' +
            (open ? 'border-brand' : 'border-surface-sunk') +
            ' ' +
            (value ? 'text-ink' : 'text-ink-soft')
        }
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown size={11} className="shrink-0 text-ink-soft" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute left-0 ${triggerClassName ? 'min-w-[200px]' : 'right-0'} top-[calc(100%+4px)] z-50 max-h-[240px] overflow-y-auto rounded-lg border border-surface-sunk bg-white p-1 shadow-card`}
        >
          {options.length === 0 && !adding && (
            <div className="px-2.5 py-1.5 text-[11px] italic text-ink-soft">
              No items yet.
            </div>
          )}
          {options.map((opt) => (
            <PickerOption
              key={opt}
              active={opt === value}
              label={opt}
              onClick={() => {
                onChange(opt);
                close();
              }}
            />
          ))}
          {options.length > 0 && <div className="my-1 h-px bg-surface-sunk" />}
          {adding ? (
            <div className="flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-1">
              <Plus size={11} className="shrink-0 text-brand" />
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitNew();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                  }
                }}
                onBlur={commitNew}
                placeholder="New item name"
                aria-label="New option name"
                className="min-w-0 flex-1 border-none bg-transparent px-0 py-1 text-xs text-ink outline-none"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={startAdding}
              className="flex w-full items-center gap-2 rounded-md border-none bg-transparent px-2.5 py-1.5 text-left text-xs font-medium text-brand cursor-pointer hover:bg-brand-soft"
            >
              <Plus size={12} />
              <span>Add to list</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
