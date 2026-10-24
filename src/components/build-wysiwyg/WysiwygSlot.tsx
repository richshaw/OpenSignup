'use client';

import { useState } from 'react';
import { Copy, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { SlotEditor } from './SlotEditor';
import { emptyHeaderCopy } from './prettyHeader';
import { placeholderMark, slotRowLabel } from './slotRow';
import { renderFieldValue } from '@/lib/slot-label';
import type { SignupStatus } from '@/schemas/signups';
import type { UseReorderableResult } from '../build-shared/useReorderable';
import type { BuildField, BuildRow } from '../build-shared/useBuildState';

type WysiwygSlotProps = {
  row: BuildRow;
  /**
   * Spots people have taken on this slot, counted as the public page counts
   * them (`committedBySlot`). A snapshot from when the page loaded.
   */
  taken: number;
  /** Whether the signup sends reminders, and so emails about a moved slot. */
  remindersOn: boolean;
  /** The signup's, for what a slot still saying "TBD" is marked with. */
  status: SignupStatus;
  fields: BuildField[];
  /**
   * All non-group fields in organizer-chosen order. `displayFields[0]` becomes
   * the collapsed row's primary anchor (large, bold). The rest form the summary
   * shown next to it.
   */
  displayFields: BuildField[];
  expanded: boolean;
  /** Move focus into the editor when it opens. */
  focusOnOpen?: boolean;
  /** Called once the editor has taken focus. */
  onFocused?: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onEditCell: (fieldRef: string, value: string) => void;
  onSetCapacity: (capacity: number | null) => void;
  /** Threaded through to EnumPicker; may return a promise the picker awaits. */
  onAddEnumOption: (fieldId: string, value: string) => void | Promise<void>;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Optional drag-reorder bindings. When omitted, the grip is hidden. */
  reorder?: UseReorderableResult;
};

/**
 * Slot row. Collapsed by default; clicking expands into a SlotEditor.
 * Hover or focus-within on the collapsed row reveals a floating toolbar
 * with Edit / Duplicate / Delete affordances (keyboard parity via
 * focus-within, per the design's "one mode cue" feedback).
 *
 * A row whose values still hold TBD, TBC or TBA, as Publish's check finds
 * them, is warm and tagged after its values (under them on a phone), as it
 * reads now, edits and all.
 */
export function WysiwygSlot({
  row,
  taken,
  remindersOn,
  status,
  fields,
  displayFields,
  expanded,
  focusOnOpen = false,
  onFocused,
  onExpand,
  onCollapse,
  onEditCell,
  onSetCapacity,
  onAddEnumOption,
  onDuplicate,
  onDelete,
  reorder,
}: WysiwygSlotProps) {
  // Whether the row is hovered or has focus within. Drives `inert` on the
  // floating toolbar so its buttons don't pollute the tab order (and stay
  // hidden from assistive tech) when the row is dormant. CSS already handles
  // the visual reveal via group-hover / group-focus-within; this state mirrors
  // those triggers for the JS-only attributes that CSS cannot set.
  const [interactive, setInteractive] = useState(false);
  if (expanded) {
    return (
      <div
        data-testid={`wysiwyg-slot-${row.id}`}
        className="border-t border-b border-surface-sunk bg-surface-raised first:rounded-t-[11px] first:border-t-0"
      >
        <SlotEditor
          row={row}
          fields={fields}
          focusOnOpen={focusOnOpen}
          {...(onFocused ? { onFocused } : {})}
          taken={taken}
          remindersOn={remindersOn}
          onCellChange={onEditCell}
          onCapacity={onSetCapacity}
          onAddEnumOption={onAddEnumOption}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onClose={onCollapse}
        />
      </div>
    );
  }

  // Anchor = first field in the organizer's chosen order. No type-based
  // promotion: a time field later in the list must not win over field 0.
  // Values render as the public page renders them, so the organizer sees
  // "Wed, Sep 30 · 6:30 PM" here too, not the stored "2026-09-30 · 18:30".
  const display = (f: BuildField): string =>
    renderFieldValue(
      { ref: f.ref, label: f.name, fieldType: f.config.fieldType },
      row.values[f.ref],
    ) ?? '';
  const anchorField = displayFields[0] ?? null;
  const anchorValue = anchorField ? display(anchorField) : '';
  const summary = displayFields
    .slice(1)
    .map(display)
    .filter((v) => v.length > 0)
    .join(' \u00b7 ');

  // Anchor placeholder shares one source of truth with the group header
  // (see emptyHeaderCopy) so identical fields read identically in both
  // surfaces — "Set a date" / "Set a time" for those types, "Set <label>"
  // (lowercased) for everything else, "Set a value" without a label.
  const isTimeAnchor = anchorField?.config.fieldType === 'time';
  const placeholder = anchorField
    ? emptyHeaderCopy(anchorField.config.fieldType, anchorField.name)
    : null;

  // Any field counts, the group's too, as in Publish's check.
  const mark = placeholderMark(row.values, fields, status);

  // aria-label must mirror the visible primary label — including the empty-state
  // placeholder — so multiple empty rows aren't exposed as identical "Edit slot"
  // to assistive tech, and say the tag. (aria-label overrides the button's text
  // content.)
  const ariaLabel = slotRowLabel({
    anchor: anchorValue,
    time: isTimeAnchor,
    prompt: placeholder,
    mark,
  });

  const anchorSizing = summary ? 'max-w-[60%] shrink-0' : 'min-w-0';

  const isDragging = reorder?.dragId === row.id;
  const isDropTarget = reorder?.overId === row.id && reorder?.dragId && reorder?.dragId !== row.id;
  const dragTargetProps = reorder?.target(row.id) ?? {};

  return (
    <div
      data-testid={`wysiwyg-slot-${row.id}`}
      {...dragTargetProps}
      onMouseEnter={() => setInteractive(true)}
      onMouseLeave={() => setInteractive(false)}
      onFocus={() => setInteractive(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setInteractive(false);
        }
      }}
      className={
        'group relative border-t first:rounded-t-[11px] first:border-t-0 transition-colors duration-180 ' +
        (isDragging
          ? 'border-transparent bg-brand-soft opacity-50'
          : isDropTarget
            ? 'border-t-2 border-brand bg-surface-raised'
            : // Warm while it still says TBD. Hover and focus tint it as any
              // row. The tag's text is 4.64:1 at rest, 4.81:1 tinted.
              `${mark ? 'bg-warn/5 ' : ''}border-transparent focus-within:bg-surface-raised/50 hover:bg-surface-raised/50`)
      }
    >
      {reorder && (
        <span
          {...reorder.source(row.id)}
          aria-hidden="true"
          className="absolute -left-1 top-1/2 z-10 inline-flex h-6 w-4 -translate-y-1/2 cursor-grab items-center justify-center text-ink-soft opacity-0 transition-opacity duration-180 group-hover:opacity-95 group-focus-within:opacity-95"
        >
          <GripVertical size={11} />
        </span>
      )}
      <button
        type="button"
        onClick={onExpand}
        aria-label={ariaLabel}
        className="flex w-full items-center justify-between gap-2.5 border-none bg-transparent px-3.5 py-2.5 text-left"
      >
        {/* The anchor keeps its natural width (capped, so a long first value
            still leaves room) and the summary absorbs the truncation. Left to
            shrink together, a short anchor like a date lost to the longer
            summary on a phone: "Wed, S…" beside a mostly visible location.
            With no summary beside it the cap would only waste the space, so
            the anchor then simply truncates at the row's edge.
            A TBD tag follows them on a computer. On a phone, where it left
            them no room and ran over the count, it has a line of its own
            under them: their box takes the first line, and on a computer
            steps aside (contents) so they sit in the row as before. On a
            computer the summary keeps 10ch beside a tag ("Sat, Apr 6"), and
            the tag drops under them when that leaves it no room, rather
            than squeeze the summary to nothing. The summary grows into what
            the line has left, but no wider than its text, so the tag sits
            right after it rather than against the count. A row without a
            tag lays out as it always has. */}
        <div
          className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 ${mark ? '' : 'md:flex-nowrap'}`}
        >
          <div className="flex min-w-0 basis-full items-center gap-2.5 md:contents">
            {anchorValue ? (
              <span className={`${anchorSizing} truncate text-sm font-semibold text-ink`}>
                {anchorValue}
              </span>
            ) : placeholder ? (
              <span className={`${anchorSizing} truncate text-sm italic font-normal text-ink-soft`}>
                {placeholder}
              </span>
            ) : (
              <span className="shrink-0 text-sm font-semibold text-ink">Slot</span>
            )}
            {summary && (
              <span
                className={`${mark ? 'min-w-[10ch] max-w-max flex-1' : 'min-w-0'} truncate text-xs text-ink-muted`}
              >
                {summary}
              </span>
            )}
          </div>
          {mark && (
            <span className="shrink-0 rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-semibold leading-tight text-warn">
              {mark}
            </span>
          )}
        </div>
        {/* Spots taken, not left: organizers want to know how many signed up.
            The public page counts what's left. */}
        <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">
          {row.capacity === null ? `${taken} taken` : `${taken} of ${row.capacity} taken`}
        </span>
      </button>
      <div
        className="absolute right-2 top-1.5 flex gap-px rounded-md border border-surface-sunk bg-white p-0.5 opacity-0 shadow-sm transition-opacity duration-180 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
        inert={!interactive}
      >
        <ToolbarButton label="Edit" onClick={onExpand}>
          <Pencil size={11} />
        </ToolbarButton>
        <ToolbarButton label="Duplicate" onClick={onDuplicate}>
          <Copy size={11} />
        </ToolbarButton>
        <ToolbarButton label="Delete" danger onClick={onDelete}>
          <Trash2 size={11} />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        // Don't bubble into the parent expand-on-click button.
        e.stopPropagation();
        onClick();
      }}
      className={
        'inline-flex h-6 w-6 items-center justify-center rounded border-none bg-transparent text-ink-soft transition-colors duration-180 ' +
        (danger ? 'hover:bg-danger/10 hover:text-danger' : 'hover:bg-surface-raised hover:text-ink')
      }
    >
      {children}
    </button>
  );
}
