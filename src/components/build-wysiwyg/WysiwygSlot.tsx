'use client';

import { useState } from 'react';
import { Copy, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { SlotEditor } from './SlotEditor';
import type { UseReorderableResult } from '../build-grid/useReorderable';
import type { GridField, GridRow } from '../build-grid/useGridState';

type WysiwygSlotProps = {
  row: GridRow;
  fields: GridField[];
  /**
   * All non-group fields in organizer-chosen order. `displayFields[0]` becomes
   * the collapsed row's primary anchor (large, bold). The rest form the summary
   * shown next to it.
   */
  displayFields: GridField[];
  expanded: boolean;
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
 */
export function WysiwygSlot({
  row,
  fields,
  displayFields,
  expanded,
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
        className="border-t border-b border-surface-sunk bg-surface-raised first:border-t-0"
      >
        <SlotEditor
          row={row}
          fields={fields}
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
  const anchorField = displayFields[0] ?? null;
  const anchorValue = anchorField ? row.values[anchorField.ref] : '';
  const summary = displayFields
    .slice(1)
    .map((f) => row.values[f.ref])
    .filter((v) => v && v.length > 0)
    .join(' \u00b7 ');

  // Time anchors keep the long-standing "Set a time" / "at HH:MM" copy;
  // everything else uses the generic name-based pattern.
  const isTimeAnchor = anchorField?.config.fieldType === 'time';

  let ariaLabel = 'Edit slot';
  if (anchorValue) {
    ariaLabel = isTimeAnchor ? `Edit slot at ${anchorValue}` : `Edit slot \u2014 ${anchorValue}`;
  }

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
        'group relative border-t first:border-t-0 transition-colors duration-180 ' +
        (isDragging
          ? 'border-transparent bg-brand-soft opacity-50'
          : isDropTarget
            ? 'border-t-2 border-brand bg-surface-raised'
            : 'border-transparent focus-within:bg-surface-raised/50 hover:bg-surface-raised/50')
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
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {anchorValue ? (
            <span className="min-w-0 truncate text-sm font-semibold text-ink">
              {anchorValue}
            </span>
          ) : anchorField ? (
            <span className="text-sm italic font-normal text-ink-soft">
              {isTimeAnchor ? 'Set a time' : `Set ${anchorField.name}`}
            </span>
          ) : (
            <span className="text-sm font-semibold text-ink">Slot</span>
          )}
          {summary && (
            <span className="truncate text-xs text-ink-muted">{summary}</span>
          )}
        </div>
        <span className="shrink-0 font-mono text-[11px] text-ink-soft">
          0/{row.capacity ?? '\u221e'}
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
