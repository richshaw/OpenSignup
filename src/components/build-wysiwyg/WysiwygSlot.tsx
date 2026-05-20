'use client';

import type { GridField, GridRow } from '../build-grid/useGridState';

type WysiwygSlotProps = {
  row: GridRow;
  timeField: GridField | null;
  otherFields: GridField[];
};

/**
 * Collapsed slot row. Click-to-expand is wired in PR 4.
 *
 * Layout:
 *   [time-or-placeholder]   [other-field summary]            [0/N]
 *
 * `timeField` is the primary "what kind of slot is this" anchor on the row.
 * `otherFields` flow into a muted middle column as " · "-joined values.
 */
export function WysiwygSlot({ row, timeField, otherFields }: WysiwygSlotProps) {
  const timeValue = timeField ? row.values[timeField.ref] : '';
  const summary = otherFields
    .map((f) => row.values[f.ref])
    .filter((v) => v && v.length > 0)
    .join(' \u00b7 ');

  return (
    <div
      data-testid={`wysiwyg-slot-${row.id}`}
      className="flex items-center justify-between gap-2.5 border-t border-transparent px-3.5 py-2.5 first:border-t-0 hover:bg-surface-raised/50"
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
    </div>
  );
}
