'use client';

import { GripHorizontal, Users, X } from 'lucide-react';
import { FIELD_TYPE_META } from '../fieldTypes';
import type { GridField, GridRow } from '../useGridState';

type SlotCardProps = {
  row: GridRow;
  idx: number;
  fields: GridField[];
  onEditCell: (rowId: string, fieldRef: string, value: string) => void;
  onSetCapacity: (rowId: string, capacity: number | null) => void;
  onDeleteRow: (rowId: string) => void;
};

export function SlotCard({
  row,
  idx,
  fields,
  onEditCell,
  onSetCapacity,
  onDeleteRow,
}: SlotCardProps) {
  return (
    <div
      data-testid="slot-card"
      className="overflow-hidden rounded-xl border border-surface-sunk bg-white"
    >
      <div className="flex items-center justify-between border-b border-surface-sunk bg-surface-raised px-3 py-2">
        <div className="flex items-center gap-2">
          <GripHorizontal size={13} className="text-ink-soft" aria-hidden="true" />
          <span className="font-mono text-[11px] tracking-wider text-ink-soft">
            SLOT {idx + 1}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onDeleteRow(row.id)}
          aria-label={`Remove slot ${idx + 1}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-white hover:text-ink"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col px-3">
        {fields.map((field, i) => (
          <FieldRow
            key={field.id}
            field={field}
            value={row.values[field.ref] ?? ''}
            onChange={(v) => onEditCell(row.id, field.ref, v)}
            withTopBorder={i > 0}
          />
        ))}
        <CapacityRow
          value={row.capacity}
          onChange={(v) => onSetCapacity(row.id, v)}
          withTopBorder={fields.length > 0}
        />
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  withTopBorder,
}: {
  field: GridField;
  value: string;
  onChange: (next: string) => void;
  withTopBorder: boolean;
}) {
  const Icon = FIELD_TYPE_META[field.type].icon;
  const inputType =
    field.type === 'date' ? 'date'
    : field.type === 'time' ? 'time'
    : field.type === 'number' ? 'number'
    : 'text';

  return (
    <div
      className={[
        'flex items-center gap-3 py-2',
        withTopBorder ? 'border-t border-surface-sunk' : '',
      ].join(' ')}
    >
      <div className="flex w-[100px] shrink-0 items-center gap-1.5 text-xs text-ink-muted">
        <Icon size={12} className="text-ink-soft" aria-hidden="true" />
        <span className="truncate">
          {field.name}
          {field.required ? <span className="text-danger"> *</span> : null}
        </span>
      </div>
      {field.type === 'enum' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={field.name}
          className="min-w-0 flex-1 appearance-none border-none bg-transparent py-1 text-base text-ink outline-none"
        >
          <option value="">—</option>
          {(field.config.fieldType === 'enum' ? field.config.choices : []).map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={field.name}
          className="min-w-0 flex-1 border-none bg-transparent py-1 text-base text-ink outline-none"
        />
      )}
    </div>
  );
}

function CapacityRow({
  value,
  onChange,
  withTopBorder,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  withTopBorder: boolean;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 py-2',
        withTopBorder ? 'border-t border-surface-sunk' : '',
      ].join(' ')}
    >
      <div className="flex w-[100px] shrink-0 items-center gap-1.5 text-xs text-ink-muted">
        <Users size={12} className="text-ink-soft" aria-hidden="true" />
        <span>Capacity</span>
      </div>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(null);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        aria-label="Capacity"
        placeholder="Unlimited"
        className="min-w-0 flex-1 border-none bg-transparent py-1 text-base text-ink outline-none placeholder:text-ink-soft"
      />
    </div>
  );
}
