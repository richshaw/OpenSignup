'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GripHorizontal, X } from 'lucide-react';
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
  onMoveRow: (fromIdx: number, toIdx: number) => void;
  onMoveRowUp: (rowId: string) => void;
  onMoveRowDown: (rowId: string) => void;
  onAnnounce?: (message: string) => void;
}

const FLASH_MS = 700;

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
  onAnnounce,
}: GridBodyProps) {
  const [hoverDragId, setHoverDragId] = useState<string | null>(null);
  const [justMovedId, setJustMovedId] = useState<string | null>(null);
  const indexCellRefs = useRef(new Map<string, HTMLDivElement>());

  const setIndexCellRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) indexCellRefs.current.set(id, el);
    else indexCellRefs.current.delete(id);
  }, []);

  useEffect(() => {
    if (justMovedId === null) return;
    const id = setTimeout(() => setJustMovedId(null), FLASH_MS);
    return () => clearTimeout(id);
  }, [justMovedId]);

  const idToIndex = useCallback(
    (id: string) => rows.findIndex((r) => r.id === id),
    [rows],
  );

  const handleReorder = useCallback(
    (fromIdx: number, toIdx: number) => {
      const moved = rows[fromIdx];
      if (!moved) return;
      onMoveRow(fromIdx, toIdx);
      setJustMovedId(moved.id);
      onAnnounce?.(`Moved slot to position ${toIdx + 1} of ${rows.length}.`);
      requestAnimationFrame(() => {
        indexCellRefs.current.get(moved.id)?.focus();
      });
    },
    [rows, onMoveRow, onAnnounce],
  );

  const { dragId, overId, source, target } = useReorderable<HTMLElement>({
    idToIndex,
    onReorder: handleReorder,
  });

  const handleIndexKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, row: GridRow, idx: number) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === 'ArrowUp' && idx > 0) {
      e.preventDefault();
      onMoveRowUp(row.id);
      setJustMovedId(row.id);
      onAnnounce?.(`Moved slot to position ${idx} of ${rows.length}.`);
    } else if (e.key === 'ArrowDown' && idx < rows.length - 1) {
      e.preventDefault();
      onMoveRowDown(row.id);
      setJustMovedId(row.id);
      onAnnounce?.(`Moved slot to position ${idx + 2} of ${rows.length}.`);
    }
  };

  return (
    <div>
      {rows.map((row, i) => {
        const isDragging = dragId === row.id;
        const isDropTarget = overId === row.id && dragId !== null && dragId !== row.id;
        const isFlashing = justMovedId === row.id;
        const showGrip = hoverDragId === row.id || isDragging;
        const targetProps = target(row.id);
        return (
          <div
            key={row.id}
            onClick={() => onSelectRow(i)}
            onDragOver={targetProps.onDragOver}
            onDragLeave={targetProps.onDragLeave}
            onDrop={targetProps.onDrop}
            style={{
              display: 'grid',
              gridTemplateColumns: buildColsTemplate(fields),
              borderBottom: '1px solid #eef1f5',
              background:
                i === highlightedRowIdx
                  ? 'rgb(31 111 235 / 0.04)'
                  : isFlashing
                    ? 'rgb(31 111 235 / 0.10)'
                    : 'transparent',
              cursor: 'pointer',
              boxShadow: isDropTarget ? 'inset 0 2px 0 0 #1f6feb' : undefined,
              opacity: isDragging ? 0.5 : 1,
            }}
            className="group transition-colors hover:bg-brand/5"
          >
            {/* Row index — 38px. Drag SOURCE; swaps to GripHorizontal on hover. */}
            <div
              ref={setIndexCellRef(row.id)}
              {...source(row.id)}
              tabIndex={0}
              role="button"
              aria-label={`Drag or use Cmd/Ctrl + Up/Down to reorder slot ${i + 1}`}
              onMouseEnter={() => setHoverDragId(row.id)}
              onMouseLeave={() => setHoverDragId((prev) => (prev === row.id ? null : prev))}
              onKeyDown={(e) => handleIndexKeyDown(e, row, i)}
              onClick={(e) => e.stopPropagation()}
              title="Drag to reorder"
              className="flex items-center justify-center px-2 border-r border-surface-sunk cursor-grab active:cursor-grabbing focus:outline-none focus:bg-brand-soft/40"
            >
              {showGrip ? (
                <GripHorizontal size={12} className="text-ink-soft" />
              ) : (
                <span className="text-[11px] text-ink-soft font-mono">{i + 1}</span>
              )}
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

            {/* Trailing actions — 130px. Left-aligned always-visible X delete. */}
            <div className="flex items-center justify-start pl-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteRow(row.id);
                }}
                title="Remove slot"
                aria-label="Remove slot"
                className="p-1 rounded text-ink-soft hover:text-danger hover:bg-surface-raised"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
