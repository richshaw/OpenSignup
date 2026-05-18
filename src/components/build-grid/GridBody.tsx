'use client';

import { ChevronUp, ChevronDown, X } from 'lucide-react';
import { buildColsTemplate } from './columnSizing';
import { CellInput } from './CellInput';
import { CapacityCell } from './CapacityCell';
import type { GridField, GridRow } from './useGridState';

interface GridBodyProps {
  fields: GridField[];
  rows: GridRow[];
  highlightedRowIdx: number;
  onSelectRow: (idx: number) => void;
  onEditCell: (rowId: string, fieldRef: string, value: string) => void;
  onSetCapacity: (rowId: string, capacity: number | null) => void;
  onDeleteRow: (rowId: string) => void;
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
  onMoveRowUp,
  onMoveRowDown,
}: GridBodyProps) {
  return (
    <div>
      {rows.map((row, i) => (
        <div
          key={row.id}
          onClick={() => onSelectRow(i)}
          style={{
            display: 'grid',
            gridTemplateColumns: buildColsTemplate(fields),
            borderBottom: '1px solid #eef1f5',
            background: i === highlightedRowIdx ? 'rgb(31 111 235 / 0.04)' : 'transparent',
            cursor: 'pointer',
          }}
          className="group transition-colors hover:bg-brand/5"
        >
          {/* Row index — 38px */}
          <div className="flex items-center justify-center px-2 border-r border-surface-sunk">
            <span className="text-[11px] text-ink-soft font-mono">{i + 1}</span>
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

          {/* Trailing actions — 130px, right-aligned to line up with the "+ Add field" header link */}
          <div className="flex items-center justify-end pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveRowUp(row.id);
              }}
              title="Move up"
              aria-label="Move row up"
              className="p-1 rounded text-ink-soft hover:text-ink hover:bg-surface-raised"
            >
              <ChevronUp size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveRowDown(row.id);
              }}
              title="Move down"
              aria-label="Move row down"
              className="p-1 rounded text-ink-soft hover:text-ink hover:bg-surface-raised"
            >
              <ChevronDown size={12} />
            </button>
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
      ))}
    </div>
  );
}
