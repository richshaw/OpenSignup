'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GridBody } from './GridBody';
import type { GridField, GridRow } from './useGridState';

export const EMPTY_KEY = '__empty';

type GroupedBodyProps = {
  fields: GridField[];
  rows: GridRow[];
  groupByFieldRef: string | null;
  highlightedRowIdx: number;
  onSelectRow: (idx: number) => void;
  onEditCell: (rowId: string, fieldRef: string, value: string) => void;
  onSetCapacity: (rowId: string, capacity: number | null) => void;
  onDeleteRow: (rowId: string) => void;
  /** Drag reorder — only passed through in flat (ungrouped) mode. */
  onMoveRow: (fromIdx: number, toIdx: number) => void;
  onMoveRowUp: (rowId: string) => void;
  onMoveRowDown: (rowId: string) => void;
};

const dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

function formatGroupLabel(field: GridField, key: string): string {
  if (field.type === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (m) {
      const [, y, mo, d] = m;
      const dt = new Date(Number(y), Number(mo) - 1, Number(d));
      return dateFmt.format(dt);
    }
  }
  return key;
}

export function GroupedBody({
  fields,
  rows,
  groupByFieldRef,
  highlightedRowIdx,
  onSelectRow,
  onEditCell,
  onSetCapacity,
  onDeleteRow,
  onMoveRow,
  onMoveRowUp,
  onMoveRowDown,
}: GroupedBodyProps) {
  const groupField = groupByFieldRef
    ? fields.find((f) => f.ref === groupByFieldRef) ?? null
    : null;

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  // Switching the group field resets which groups are collapsed.
  useEffect(() => {
    setCollapsed(new Set());
  }, [groupByFieldRef]);

  const flatIndexById = useMemo(
    () => new Map(rows.map((r, i) => [r.id, i])),
    [rows],
  );

  if (!groupField) {
    return (
      <GridBody
        fields={fields}
        rows={rows}
        highlightedRowIdx={highlightedRowIdx}
        onSelectRow={onSelectRow}
        onEditCell={onEditCell}
        onSetCapacity={onSetCapacity}
        onDeleteRow={onDeleteRow}
        onMoveRow={onMoveRow}
        onMoveRowUp={onMoveRowUp}
        onMoveRowDown={onMoveRowDown}
      />
    );
  }

  const ref = groupField.ref;

  // Bucket rows by group key. Preserve flat sortOrder within each bucket.
  const groups = new Map<string, GridRow[]>();
  for (const r of rows) {
    const raw = r.values[ref];
    const key = raw === undefined || raw === null || raw === '' ? EMPTY_KEY : String(raw);
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(r);
  }

  // Ascending lex; YYYY-MM-DD sorts chronologically; '__empty' pinned last.
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === EMPTY_KEY) return 1;
    if (b === EMPTY_KEY) return -1;
    return a.localeCompare(b);
  });

  const highlightedRowId =
    highlightedRowIdx >= 0 ? rows[highlightedRowIdx]?.id ?? null : null;

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      {keys.map((key) => {
        const groupRows = groups.get(key) ?? [];
        const isCollapsed = collapsed.has(key);
        const localHighlight = highlightedRowId
          ? groupRows.findIndex((r) => r.id === highlightedRowId)
          : -1;
        const label = key === EMPTY_KEY ? null : formatGroupLabel(groupField, key);
        const count = groupRows.length;

        return (
          <div key={key}>
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center gap-2 border-t border-b border-surface-sunk bg-surface-raised px-3.5 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted"
            >
              <ChevronDown
                size={11}
                className="transition-transform"
                style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}
              />
              {label === null ? (
                <em className="not-italic">No value</em>
              ) : (
                <span>{label}</span>
              )}
              <span className="text-[10px] font-semibold tracking-normal text-ink-soft normal-case">
                {count} slot{count === 1 ? '' : 's'}
              </span>
            </button>
            {!isCollapsed && (
              <GridBody
                fields={fields}
                rows={groupRows}
                highlightedRowIdx={localHighlight}
                onSelectRow={(localIdx) => {
                  const r = groupRows[localIdx];
                  if (!r) return;
                  const flat = flatIndexById.get(r.id);
                  if (flat !== undefined) onSelectRow(flat);
                }}
                onEditCell={onEditCell}
                onSetCapacity={onSetCapacity}
                onDeleteRow={onDeleteRow}
                onMoveRowUp={onMoveRowUp}
                onMoveRowDown={onMoveRowDown}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
