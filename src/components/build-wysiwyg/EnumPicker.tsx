'use client';

import { useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useOutsideClose } from '@/hooks/useOutsideClose';
import { PickerOption } from './PickerOption';

type EnumPickerProps = {
  value: string;
  options: string[];
  ariaLabel: string;
  onChange: (next: string) => void;
  /**
   * Called when the user adds a brand-new option from inside the picker.
   * Implementations should append the value to the field's `choices` config.
   * The picker calls `onChange` with the new value straight after, without
   * waiting, so a click that lands on Duplicate copies it. The builder holds
   * back slot saves until the field's `choices` save lands (otherwise the
   * server could see a value not yet in `choices` and refuse it).
   */
  onAddOption: (value: string) => void;
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
    // Mark settled so any blur fired during unmount (Escape, or picking an
    // option) doesn't fall into commitNew and add the draft as a new option.
    settledRef.current = true;
    setOpen(false);
    setAdding(false);
    setDraft('');
  };

  // A click outside adds what's typed, as Tab does (#656); only Escape cancels.
  useOutsideClose(open, [menuRef, triggerRef], () => (adding ? commitNew() : close()));

  const startAdding = () => {
    settledRef.current = false;
    setAdding(true);
  };

  function commitNew() {
    if (settledRef.current) return;
    settledRef.current = true;
    const v = draft.trim();
    setOpen(false);
    setAdding(false);
    setDraft('');
    if (v) {
      onAddOption(v);
      onChange(v);
    }
  }

  return (
    <div
      className={triggerClassName ? 'relative inline-block' : 'relative'}
      data-testid="enum-picker"
      // Escape closes an open menu, and only the menu: the slot editor around
      // it leaves a key that's been used alone. Focus goes back to the trigger,
      // as the options it was on are gone. The box for a new item handles
      // Escape itself first.
      onKeyDown={(e) => {
        if (!open || e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        close();
        triggerRef.current?.focus();
      }}
    >
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
            // The box and Add span the row, edge to edge like an option's
            // highlight, and the input's left padding puts typed text where the
            // option labels start: 1px border + 9px = px-2.5.
            <div className="flex items-center gap-1 py-1">
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
                    triggerRef.current?.focus();
                  }
                }}
                onBlur={commitNew}
                placeholder="Type a new item"
                aria-label="New option name"
                className="min-w-0 flex-1 rounded border border-surface-sunk bg-white py-1.5 pl-[9px] pr-2 text-xs text-ink outline-none placeholder:text-ink-soft focus:border-brand"
              />
              <button
                type="button"
                // Keeps focus in the box, so its blur doesn't add first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={commitNew}
                // The same 1px border as the box, so the two stay the same height.
                className="shrink-0 rounded border border-brand bg-brand px-2.5 py-1.5 text-xs font-semibold text-white cursor-pointer hover:bg-brand-hover"
              >
                Add
              </button>
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
