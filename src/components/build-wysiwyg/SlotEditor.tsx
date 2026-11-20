'use client';

import { useEffect, useId, useRef } from 'react';
import { Check, Copy, Hash, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  FIELD_TYPE_META,
  FIELD_VALUE_INPUT_CLASS,
  FIELD_VALUE_INPUTS,
} from '../build-shared/fieldTypes';
import { InlineNote } from '@/components/ui/inline-note';
import { SLOT_CHANGE_SETTLE_MINUTES } from '@/lib/reminder-eligibility';
import { TimeSelect } from '../build-shared/TimeSelect';
import { EnumPicker } from './EnumPicker';
import { useSignupLanguage } from './signup-language';
import type { BuildField, BuildRow } from '../build-shared/useBuildState';

type SlotEditorProps = {
  row: BuildRow;
  /**
   * The editor's accessible name, for the slot it edits ("Editing slot —
   * Cupcakes"), so its Duplicate, Delete and Done are heard with their slot.
   */
  label: string;
  fields: BuildField[];
  /** Focus the first field's control when the editor opens. */
  focusOnOpen?: boolean;
  /** Called once the editor has taken focus, so the request can be cleared. */
  onFocused?: () => void;
  /** Spots taken on this slot when the page loaded (`committedBySlot`). */
  taken: number;
  /**
   * Whether the people holding this slot are emailed when its date or time
   * changes: the signup sends reminders. The change email follows the same
   * switch (src/jobs/slot-changes.ts).
   */
  remindersOn: boolean;
  /**
   * A save has moved the slot since the page loaded, with reminders on, so
   * the people holding it are to be emailed once it settles
   * (`slotMoved` in useBuildState).
   */
  moved?: boolean;
  onCellChange: (fieldRef: string, value: string) => void;
  onCapacity: (capacity: number | null) => void;
  /** Append `value` to the field's enum choices config. Only called for enum cells. */
  onAddEnumOption: (fieldId: string, value: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Done, or Escape in any of the editor's boxes. */
  onClose: () => void;
};

/**
 * Inline accordion editor for a single slot. Auto-fit grid keeps small
 * schemas tight while letting wider schemas wrap naturally. Spots takes a
 * row of its own, so its hint can sit on one line beside the box rather
 * than wrapping in whatever part of a row the fields leave over.
 */
export function SlotEditor({
  row,
  label,
  fields,
  focusOnOpen = false,
  onFocused,
  taken,
  remindersOn,
  moved = false,
  onCellChange,
  onCapacity,
  onAddEnumOption,
  onDuplicate,
  onDelete,
  onClose,
}: SlotEditorProps) {
  const t = useTranslations('organizer.build');
  const { locale, lang } = useSignupLanguage();
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusOnOpen) return;
    gridRef.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    onFocused?.();
  }, [focusOnOpen, onFocused]);

  const spotsHelpId = useId();
  // The wait the worker keeps before it emails (src/jobs/notify-rules.ts).
  const movedNote = t('editor.moved', { taken, minutes: SLOT_CHANGE_SETTLE_MINUTES });
  return (
    <div
      role="group"
      aria-label={label}
      // Escape closes the editor as Done does, its edits kept: they save as
      // they're typed. Not when a control inside has used the key itself, as
      // a list's menu or its box for a new item does to close only that.
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        onClose();
      }}
      className="px-3.5 pb-3.5 pt-3"
      data-testid={`slot-editor-${row.id}`}
      // Where BuildWysiwyg finds the editor, and each field's box in it, to
      // put focus in when Publish's check opens this slot.
      data-slot-editor={row.id}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft">
          {t('editor.title')}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex items-center gap-1 rounded-md border-none bg-transparent px-1.5 py-1 text-[11px] font-medium text-ink-muted hover:bg-surface-raised hover:text-ink"
          >
            <Copy size={11} />
            {t('editor.duplicate')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-md border-none bg-transparent px-1.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/10"
          >
            <Trash2 size={11} />
            {t('editor.delete')}
          </button>
          {/* The darker blue: the brand's own is 4.4:1 on the open editor's
              grey, under AA's 4.5:1 for text this small. */}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border-none bg-transparent px-1.5 py-1 text-[11px] font-medium text-brand-hover hover:bg-brand-soft"
          >
            <Check size={11} />
            {t('editor.done')}
          </button>
        </div>
      </div>
      {taken > 0 && (
        <InlineNote className="mb-2.5">
          {remindersOn && moved
            ? movedNote
            : t('editor.signedUp', { taken, reminders: remindersOn ? 'on' : 'off' })}
        </InlineNote>
      )}
      {/* A note's new text isn't announced, so the moved line is said here
          too, once, when a save moves the slot: the note itself stays a note
          rather than a live region read out whole on every change. */}
      {taken > 0 && remindersOn && (
        <span role="status" className="sr-only">
          {moved ? movedNote : ''}
        </span>
      )}
      <div ref={gridRef} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        {fields.map((f) => {
          const fieldType = f.config.fieldType;
          const TypeIcon = FIELD_TYPE_META[fieldType].icon;
          // A list cell is a div, not a label. A label passes every click inside
          // it on to its first control, the picker's trigger. Picking an option
          // or "Add to list" removes the clicked button before the browser checks
          // where the click came from, so the click reached the trigger too:
          // picking reopened the menu, and "Add to list" closed its input as
          // soon as it appeared. The trigger has its own aria-label.
          const Cell = fieldType === 'enum' ? 'div' : 'label';
          return (
            <Cell
              key={f.id}
              data-field-ref={f.ref}
              className="flex flex-col gap-1 text-[11px] text-ink-muted"
            >
              <span className="inline-flex items-center gap-1" lang={lang}>
                <TypeIcon size={10} className="text-ink-soft" />
                {f.name}
              </span>
              {f.config.fieldType === 'enum' ? (
                <EnumPicker
                  value={row.values[f.ref] ?? ''}
                  options={f.config.choices}
                  ariaLabel={t('editor.value', { field: f.name })}
                  lang={lang}
                  onChange={(v) => onCellChange(f.ref, v)}
                  onAddOption={(v) => onAddEnumOption(f.id, v)}
                />
              ) : f.config.fieldType === 'time' ? (
                <TimeSelect
                  value={row.values[f.ref] ?? ''}
                  onChange={(v) => onCellChange(f.ref, v)}
                  noTimeLabel={t('editor.noTime')}
                  locale={locale}
                  className={FIELD_VALUE_INPUT_CLASS}
                  aria-label={t('editor.value', { field: f.name })}
                />
              ) : (
                <input
                  {...FIELD_VALUE_INPUTS[f.config.fieldType]}
                  {...(f.config.fieldType === 'text' ? { maxLength: f.config.maxLength } : {})}
                  placeholder={t(`placeholder.${f.config.fieldType}`)}
                  value={row.values[f.ref] ?? ''}
                  onChange={(e) => onCellChange(f.ref, e.target.value)}
                  className={FIELD_VALUE_INPUT_CLASS}
                  aria-label={t('editor.value', { field: f.name })}
                />
              )}
            </Cell>
          );
        })}
        <label className="col-span-full flex flex-col gap-1 text-[11px] text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Hash size={10} className="text-ink-soft" />
            {t('editor.spots')}
          </span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={row.capacity ?? ''}
              placeholder={t('editor.noLimit')}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  onCapacity(null);
                  return;
                }
                const parsed = parseInt(raw, 10);
                onCapacity(Math.max(1, Number.isFinite(parsed) ? parsed : 1));
              }}
              aria-label={t('editor.spots')}
              aria-describedby={spotsHelpId}
              // Wide enough for its placeholder in every catalog language,
              // beside the room Chrome keeps for the arrows: Swedish
              // "Obegränsat" needs 73px of text where English "No limit"
              // needs 46px, and the 80px box cut it off.
              className="w-28 shrink-0 rounded-md border border-surface-sunk bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
            />
            <span id={spotsHelpId} className="min-w-0 text-[11px] text-ink-soft">
              {t('editor.spotsHelp')}
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
