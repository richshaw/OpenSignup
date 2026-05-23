'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';

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
};

/**
 * Single-select dropdown with an inline "+ Add to list" footer. Designed to
 * replace the bare `<input>` for enum fields in SlotEditor — list options
 * grow as organizers fill in values, instead of needing a separate schema
 * trip.
 */
export function EnumPicker({ value, options, ariaLabel, onChange, onAddOption }: EnumPickerProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Prevents Enter committing and then the unmount-triggered onBlur committing
  // a second time (which would call onAddOption twice).
  const settledRef = useRef(false);

  useEffect(() => {
    if (adding) {
      settledRef.current = false;
      inputRef.current?.focus();
    }
  }, [adding]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        close();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const close = () => {
    // Mark settled so any blur fired during unmount (Escape, click-outside)
    // doesn't fall into commitNew and add the draft as a new option.
    settledRef.current = true;
    setOpen(false);
    setAdding(false);
    setDraft('');
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
    <div className="relative" data-testid="enum-picker">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={
          'flex w-full items-center justify-between gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-left text-[13px] outline-none ' +
          (open ? 'border-brand' : 'border-surface-sunk') +
          ' ' +
          (value ? 'text-ink' : 'text-ink-soft')
        }
      >
        <span className="truncate">{value || 'Choose\u2026'}</span>
        <ChevronDown size={11} className="shrink-0 text-ink-soft" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[240px] overflow-y-auto rounded-lg border border-surface-sunk bg-white p-1 shadow-card"
        >
          {options.length === 0 && !adding && (
            <div className="px-2.5 py-1.5 text-[11px] italic text-ink-soft">
              No items yet.
            </div>
          )}
          {options.map((opt) => {
            const active = opt === value;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt);
                  close();
                }}
                className={
                  'flex w-full items-center gap-2 rounded-md border-none px-2.5 py-1.5 text-left text-xs cursor-pointer ' +
                  (active
                    ? 'bg-brand-soft font-semibold text-brand'
                    : 'bg-transparent font-medium text-ink hover:bg-surface-raised')
                }
              >
                <span className="inline-flex w-3 shrink-0">{active && <Check size={11} />}</span>
                <span className="flex-1 truncate">{opt}</span>
              </button>
            );
          })}
          {options.length > 0 && <div className="my-1 h-px bg-surface-sunk" />}
          {adding ? (
            <div className="flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-1">
              <Plus size={11} className="shrink-0 text-brand" />
              <input
                ref={inputRef}
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
              onClick={() => setAdding(true)}
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
