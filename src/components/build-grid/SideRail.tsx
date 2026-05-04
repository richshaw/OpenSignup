'use client';

import { Eye } from 'lucide-react';
import { summarizeSlot } from '@/lib/slot-summary';
import type { GridField, GridRow } from './useGridState';

type SideRailProps = {
  fields: GridField[];
  rows: GridRow[];
  previewRowIdx: number;
  onSelectRow: (idx: number) => void;
};

export function SideRail({ fields, rows, previewRowIdx, onSelectRow }: SideRailProps) {
  // summarizeSlot expects SlotFieldDefinition[] which has `label` not `name`
  const fieldDefs = fields.map((f) => ({
    id: f.id,
    ref: f.ref,
    label: f.name,
    fieldType: f.type,
    required: f.required,
    sortOrder: f.sortOrder,
    config: f.config,
  }));

  return (
    <div className="sticky top-5 flex flex-col gap-2.5">
      {/* Caption row */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-brand tracking-wide">
          <Eye size={12} className="text-brand" />
          LIVE PREVIEW
        </span>
        <span className="text-xs text-ink-soft">
          Row {previewRowIdx + 1} of {rows.length}
        </span>
      </div>

      {/* Phone frame */}
      <div className="bg-[#0b1220] rounded-[28px] p-2 shadow-[0_8px_32px_rgb(11_18_32/0.12)]">
        {/* Screen */}
        <div className="bg-surface-raised rounded-[22px] overflow-hidden h-[540px] flex flex-col">
          {/* Status bar */}
          <div className="h-7 bg-white flex items-center justify-between px-4 text-[10px] font-semibold text-ink flex-shrink-0">
            <span>9:41</span>
            <span>••• Wi-Fi 100%</span>
          </div>

          {/* Page content */}
          <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2">
            {/* Title */}
            <div className="text-sm font-bold tracking-tight text-ink leading-snug">
              Sign-up Preview
            </div>

            {/* Divider */}
            <div className="h-px bg-surface-sunk my-1" />

            {/* Slot cards */}
            {rows.map((row, i) => {
              const summary = summarizeSlot(fieldDefs, row.values as Record<string, unknown>);
              const isActive = i === previewRowIdx;
              return (
                <button
                  key={row.id}
                  onClick={() => onSelectRow(i)}
                  className={[
                    'border rounded-[10px] p-2 w-full text-left font-[inherit] flex items-center justify-between gap-2 transition-all duration-100 cursor-pointer',
                    isActive
                      ? 'bg-white border-brand shadow-[0_0_0_2px_#dbe7ff]'
                      : 'bg-transparent border-surface-sunk',
                  ].join(' ')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-ink truncate">
                      {summary || 'Untitled slot'}
                    </div>
                    <div className="text-[10px] text-ink-soft mt-0.5">
                      0{row.capacity != null ? `/${row.capacity}` : ''} signed up
                    </div>
                  </div>
                  <div
                    className={[
                      'text-[10px] font-medium px-2.5 py-0.5 rounded-full border flex-shrink-0',
                      isActive
                        ? 'bg-brand text-white border-brand'
                        : 'bg-white text-ink border-surface-sunk',
                    ].join(' ')}
                  >
                    Sign up
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
