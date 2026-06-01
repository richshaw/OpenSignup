'use client';

import { Plus } from 'lucide-react';
import { Editable } from './Editable';
import { WysiwygSlot } from './WysiwygSlot';
import { prettyHeader, emptyHeaderCopy } from './prettyHeader';
import type { UseReorderableResult } from '../build-grid/useReorderable';
import type { GridField, GridRow } from '../build-grid/useGridState';

export type SlotGroup = {
  /** Stable key — group field value, or `'__empty__'` for the no-value bucket. */
  key: string;
  /** Raw group-field value at the time of partitioning ('' for empty bucket). */
  rawValue: string;
  rows: GridRow[];
};

type WysiwygGroupProps = {
  group: SlotGroup;
  groupField: GridField | null;
  /**
   * All non-group fields in organizer-chosen order. The first becomes the
   * collapsed row's primary anchor; the rest form the summary.
   */
  displayFields: GridField[];
  fields: GridField[];
  expandedRowId: string | null;
  onExpandRow: (rowId: string | null) => void;
  onEditCell: (rowId: string, fieldRef: string, value: string) => void;
  onSetCapacity: (rowId: string, capacity: number | null) => void;
  /** Threaded through to EnumPicker; may return a promise the picker awaits. */
  onAddEnumOption: (fieldId: string, value: string) => void | Promise<void>;
  onDuplicateRow: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onAddSlot: (groupKey: string) => void;
  onRenameGroup: (oldKey: string, newKey: string) => void;
  /** Shared drag-reorder bindings for slot rows. */
  reorder?: UseReorderableResult;
};

export function WysiwygGroup({
  group,
  groupField,
  displayFields,
  fields,
  expandedRowId,
  onExpandRow,
  onEditCell,
  onSetCapacity,
  onAddEnumOption,
  onDuplicateRow,
  onDeleteRow,
  onAddSlot,
  onRenameGroup,
  reorder,
}: WysiwygGroupProps) {
  const showHeader = groupField !== null;
  const display = groupField
    ? prettyHeader(group.rawValue, groupField.config.fieldType, groupField.name)
    : '';
  const placeholder = groupField
    ? emptyHeaderCopy(groupField.config.fieldType, groupField.name)
    : '';

  return (
    <div>
      {showHeader && groupField && (
        <div className="mb-2 -ml-1.5">
          <Editable
            value={group.rawValue}
            display={display}
            onChange={(next) => onRenameGroup(group.key, next)}
            placeholder={placeholder}
            ariaLabel={`Group header \u2014 ${display}`}
            className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft"
          />
        </div>
      )}
      <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-surface-sunk bg-white">
        {group.rows.map((row) => (
          <WysiwygSlot
            key={row.id}
            row={row}
            fields={fields}
            displayFields={displayFields}
            expanded={expandedRowId === row.id}
            onExpand={() => onExpandRow(row.id)}
            onCollapse={() => onExpandRow(null)}
            onEditCell={(ref, v) => onEditCell(row.id, ref, v)}
            onSetCapacity={(c) => onSetCapacity(row.id, c)}
            onAddEnumOption={onAddEnumOption}
            onDuplicate={() => onDuplicateRow(row.id)}
            onDelete={() => onDeleteRow(row.id)}
            {...(reorder ? { reorder } : {})}
          />
        ))}
        <button
          type="button"
          onClick={() => onAddSlot(group.key)}
          className={
            'inline-flex w-full items-center gap-1.5 px-3.5 py-2.5 text-left text-xs font-medium text-ink-muted ' +
            'transition-colors duration-180 hover:bg-brand-soft hover:text-brand ' +
            (group.rows.length > 0 ? 'border-t border-dashed border-surface-sunk' : '')
          }
        >
          <Plus size={12} />
          Add a slot
        </button>
      </div>
    </div>
  );
}
