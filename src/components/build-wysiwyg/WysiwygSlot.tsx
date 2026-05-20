'use client';

import { Copy, Pencil, Trash2 } from 'lucide-react';
import { SlotEditor } from './SlotEditor';
import type { GridField, GridRow } from '../build-grid/useGridState';

type WysiwygSlotProps = {
  row: GridRow;
  fields: GridField[];
  timeField: GridField | null;
  otherFields: GridField[];
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onEditCell: (fieldRef: string, value: string) => void;
  onSetCapacity: (capacity: number) => void;
  onAddEnumOption: (fieldId: string, value: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
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
  timeField,
  otherFields,
  expanded,
  onExpand,
  onCollapse,
  onEditCell,
  onSetCapacity,
  onAddEnumOption,
  onDuplicate,
  onDelete,
}: WysiwygSlotProps) {
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

  const timeValue = timeField ? row.values[timeField.ref] : '';
  const summary = otherFields
    .map((f) => row.values[f.ref])
    .filter((v) => v && v.length > 0)
    .join(' \u00b7 ');

  return (
    <div
      data-testid={`wysiwyg-slot-${row.id}`}
      className="group relative border-t border-transparent first:border-t-0 focus-within:bg-surface-raised/50 hover:bg-surface-raised/50"
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label={`Edit slot${timeValue ? ` at ${timeValue}` : ''}`}
        className="flex w-full items-center justify-between gap-2.5 border-none bg-transparent px-3.5 py-2.5 text-left"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {timeValue ? (
            <span className="text-sm font-semibold text-ink">{timeValue}</span>
          ) : timeField ? (
            <span className="text-sm italic font-normal text-ink-soft">Set a time</span>
          ) : (
            <span className="text-sm font-semibold text-ink">Slot</span>
          )}
          {summary && (
            <span className="truncate text-xs text-ink-muted">{summary}</span>
          )}
        </div>
        <span className="shrink-0 font-mono text-[11px] text-ink-soft">
          0/{row.capacity ?? 1}
        </span>
      </button>
      <div
        className="absolute right-2 top-1.5 flex gap-px rounded-md border border-surface-sunk bg-white p-0.5 opacity-0 shadow-sm transition-opacity duration-180 group-hover:opacity-100 group-focus-within:opacity-100"
        aria-hidden={false}
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
