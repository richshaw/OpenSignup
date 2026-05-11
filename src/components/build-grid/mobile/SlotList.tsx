'use client';

import { ChevronDown } from 'lucide-react';
import { SlotCard } from './SlotCard';
import type { GridField, GridRow } from '../useGridState';

// `YYYY-MM-DD` parsed via `new Date()` is treated as UTC, then shifted to local
// time — in negative timezones that flips the previous day/month. Parse the
// components manually so getMonth() reflects the calendar date the user typed.
function parseLocalDate(raw: string): Date | null {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

type SlotListProps = {
  rows: GridRow[];
  fields: GridField[];
  groupByFieldRef: string | null;
  onEditCell: (rowId: string, fieldRef: string, value: string) => void;
  onSetCapacity: (rowId: string, capacity: number | null) => void;
  onDeleteRow: (rowId: string) => void;
};

export function SlotList({
  rows,
  fields,
  groupByFieldRef,
  onEditCell,
  onSetCapacity,
  onDeleteRow,
}: SlotListProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-sunk px-4 py-6 text-center text-sm text-ink-soft">
        No slots yet. Tap <span className="font-medium text-ink">+ Add slot</span> to create one.
      </div>
    );
  }

  const groupField = groupByFieldRef
    ? fields.find((f) => f.ref === groupByFieldRef) ?? null
    : null;

  if (!groupField) {
    return (
      <div className="flex flex-col gap-2.5">
        {rows.map((row, idx) => (
          <SlotCard
            key={row.id}
            row={row}
            idx={idx}
            fields={fields}
            onEditCell={onEditCell}
            onSetCapacity={onSetCapacity}
            onDeleteRow={onDeleteRow}
          />
        ))}
      </div>
    );
  }

  type Group = { key: string; label: string; entries: Array<{ row: GridRow; idx: number }> };
  const groupMap = new Map<string, Group>();

  rows.forEach((row, idx) => {
    const raw = row.values[groupField.ref] ?? '';
    let key: string;
    let label: string;
    if (groupField.type === 'date') {
      const parsed = parseLocalDate(raw);
      if (!parsed) {
        key = '__empty';
        label = 'No date';
      } else {
        key = `${parsed.getFullYear()}-${parsed.getMonth()}`;
        label = parsed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      }
    } else {
      if (!raw) {
        key = '__empty';
        label = '— Empty';
      } else {
        key = raw;
        label = raw;
      }
    }
    const existing = groupMap.get(key);
    if (existing) {
      existing.entries.push({ row, idx });
    } else {
      groupMap.set(key, { key, label, entries: [{ row, idx }] });
    }
  });

  const groups = [...groupMap.values()];

  return (
    <div className="flex flex-col gap-3.5">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-[rgb(31_111_235/0.10)] px-2.5 py-1.5 text-xs font-semibold text-brand">
            <ChevronDown size={11} aria-hidden="true" />
            <span>{g.label}</span>
            <span className="font-normal text-ink-soft">
              · {g.entries.length} {g.entries.length === 1 ? 'slot' : 'slots'}
            </span>
          </div>
          {g.entries.map(({ row, idx }) => (
            <SlotCard
              key={row.id}
              row={row}
              idx={idx}
              fields={fields}
              onEditCell={onEditCell}
              onSetCapacity={onSetCapacity}
              onDeleteRow={onDeleteRow}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
