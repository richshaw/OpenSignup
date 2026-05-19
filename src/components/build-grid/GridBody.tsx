'use client';

import { useState } from 'react';
import { Trash, GripHorizontal } from 'lucide-react';
import { buildColsTemplate } from './columnSizing';
import { CellInput } from './CellInput';
import { CapacityCell } from './CapacityCell';
import { useReorderable } from './useReorderable';
import type { GridField, GridRow } from './useGridState';

interface GridBodyProps {
  fields: GridField[];
  rows: GridRow[];
  highlightedRowIdx: number;
  onSelectRow: (idx: number) => void;
  onEditCell: (rowId: string, fieldRef: string, value: string) => void;
  onSetCapacity: (rowId: string, capacity: number | null) => void;
  onDeleteRow: (rowId: string) => void;
  /** Drag reorder by index. When absent, drag handle stays hidden (e.g. grouped mode). */
  onMoveRow?: (fromIdx: number, toIdx: number) => void;
  /** Keyboard reorder by id. Caller defines "up/down" — flat-adjacent in flat
   *  mode, within-group adjacent in grouped mode (see GroupedBody). */
  onMoveRowUp: (rowId: string) => void;
  onMoveRowDown: (rowId: string) => void;
}

export function GridBody({
  fields,
  rows,
  highlightedRowIdx,
  onSelectRow,
  onEditCell,
  onSetCapacity,
  onDeleteRow,
  onMoveRow,
  onMoveRowUp,
  onMoveRowDown,
}: GridBodyProps) {
  const dragEnabled = Boolean(onMoveRow);
  const reorder = useReorderable({
    items: rows,
    onReorder: (from, to) => onMoveRow?.(from, to),
  });
  const cols = buildColsTemplate(fields);

  return (
    <div>
      {rows.map((row, i) => (
        <GridBodyRow
          key={row.id}
          row={row}
          index={i}
          fields={fields}
          cols={cols}
          highlighted={i === highlightedRowIdx}
          dragEnabled={dragEnabled}
          reorder={reorder}
          onSelectRow={() => onSelectRow(i)}
          onEditCell={onEditCell}
          onSetCapacity={onSetCapacity}
          onDeleteRow={onDeleteRow}
          onMoveRowUp={onMoveRowUp}
          onMoveRowDown={onMoveRowDown}
        />
      ))}
    </div>
  );
}

interface GridBodyRowProps {
  row: GridRow;
  index: number;
  fields: GridField[];
  cols: string;
  highlighted: boolean;
  dragEnabled: boolean;
  reorder: ReturnType<typeof useReorderable<GridRow>>;
  onSelectRow: () => void;
  onEditCell: (rowId: string, fieldRef: string, value: string) => void;
  onSetCapacity: (rowId: string, capacity: number | null) => void;
  onDeleteRow: (rowId: string) => void;
  onMoveRowUp: (rowId: string) => void;
  onMoveRowDown: (rowId: string) => void;
}

function GridBodyRow({
  row,
  index,
  fields,
  cols,
  highlighted,
  dragEnabled,
  reorder,
  onSelectRow,
  onEditCell,
  onSetCapacity,
  onDeleteRow,
  onMoveRowUp,
  onMoveRowDown,
}: GridBodyRowProps) {
  const [hover, setHover] = useState(false);
  const [handleFocused, setHandleFocused] = useState(false);
  const showHandle = dragEnabled && (hover || handleFocused);
  const isDragging = dragEnabled && reorder.dragId === row.id;
  const isDropTarget =
    dragEnabled && reorder.overId === row.id && reorder.dragId !== null && reorder.dragId !== row.id;

  const targetProps = dragEnabled ? reorder.target(row.id) : {};
  // Only attach the drag source while the handle is visible — keeps the rest
  // of the row click-friendly and avoids accidental drags from the # text.
  const sourceProps = showHandle ? reorder.source(row.id) : {};

  return (
    <div
      onClick={onSelectRow}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...targetProps}
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        borderBottom: '1px solid #eef1f5',
        // Inset shadow paints the 2px brand drop indicator at the top of the
        // target row without affecting layout, so we avoid doubling the 1px
        // separator that the header (and grouped-mode group header) already
        // render. `undefined` lets the className `hover:bg-brand/5` apply.
        boxShadow: isDropTarget ? 'inset 0 2px 0 var(--brand)' : undefined,
        opacity: isDragging ? 0.5 : 1,
        cursor: 'pointer',
        // Only set inline backgroundColor when highlighted-and-not-dragging.
        // Leaving it unset lets `bg-brand-soft` (dragged) and `hover:bg-brand/5`
        // (hover) take effect via className specificity.
        ...(highlighted && !isDragging
          ? { backgroundColor: 'rgb(31 111 235 / 0.04)' }
          : {}),
      }}
      className={`group transition-colors hover:bg-brand/5 ${isDragging ? 'bg-brand-soft' : ''}`}
    >
      {/* Row # / drag handle — focusable for Cmd/Ctrl+↑/↓ reorder. Not a
          button: it doesn't activate on Enter/Space, so we leave it role-less
          and rely on aria-label + aria-keyshortcuts to describe the contract. */}
      <div
        {...sourceProps}
        tabIndex={0}
        onFocus={() => setHandleFocused(true)}
        onBlur={() => setHandleFocused(false)}
        onKeyDown={(e) => {
          if (!(e.metaKey || e.ctrlKey)) return;
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            onMoveRowUp(row.id);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onMoveRowDown(row.id);
          }
        }}
        aria-label={`Row ${index + 1}.${dragEnabled ? ' Drag to reorder, or focus and press Cmd or Ctrl plus up or down arrows.' : ' Focus and press Cmd or Ctrl plus up or down arrows to reorder.'}`}
        aria-keyshortcuts="Meta+ArrowUp Meta+ArrowDown Control+ArrowUp Control+ArrowDown"
        title={dragEnabled ? 'Drag or Cmd/Ctrl + ↑/↓ to reorder' : 'Cmd/Ctrl + ↑/↓ to reorder'}
        style={{
          cursor: showHandle ? 'grab' : 'default',
          outline: handleFocused ? '2px solid var(--brand)' : 'none',
          outlineOffset: handleFocused ? -2 : 0,
        }}
        className="flex items-center justify-center px-2 border-r border-surface-sunk text-[11px] font-mono text-ink-soft min-h-[38px]"
      >
        {showHandle ? <GripHorizontal size={12} /> : index + 1}
      </div>

      {/* Field cells */}
      {fields.map((f) => (
        <div
          key={f.id}
          className="flex items-center px-0 border-r border-surface-sunk min-h-[38px]"
        >
          <CellInput
            field={f}
            value={row.values[f.ref] ?? ''}
            onChange={(v) => onEditCell(row.id, f.ref, v)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ))}

      {/* Capacity cell — 90px */}
      <div className="flex items-center px-0 border-r border-surface-sunk min-h-[38px]">
        <CapacityCell
          capacity={row.capacity}
          onChange={(v) => onSetCapacity(row.id, v)}
        />
      </div>

      {/* Trailing actions — always-visible left-aligned delete, no chevrons. */}
      <div className="flex items-center justify-start pl-3 min-h-[38px]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRow(row.id);
          }}
          title="Delete slot"
          aria-label="Delete slot"
          className="p-1.5 rounded text-ink-soft hover:text-danger"
        >
          <Trash size={13} />
        </button>
      </div>
    </div>
  );
}
