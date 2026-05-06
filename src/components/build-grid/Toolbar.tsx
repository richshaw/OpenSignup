'use client';

import { Plus, Smartphone } from 'lucide-react';
import { SaveStatus } from './SaveStatus';
import type { GridField, GridRow, SaveStatus as SaveStatusType } from './useGridState';

type ToolbarProps = {
  fields: GridField[];
  rows: GridRow[];
  groupByFieldRef: string | null;
  onGroupByChange: (ref: string | null) => void;
  showPreview: boolean;
  onTogglePreview: () => void;
  saveStatus: SaveStatusType;
  onAddField: () => void;
};

export function Toolbar({
  fields,
  rows,
  groupByFieldRef,
  onGroupByChange,
  showPreview,
  onTogglePreview,
  saveStatus,
  onAddField,
}: ToolbarProps) {
  const groupableFields = fields.filter((f) => f.type === 'date' || f.type === 'text');

  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-surface-sunk bg-surface-raised">
      {/* Add column button */}
      <button
        onClick={onAddField}
        aria-label="Add column"
        className="flex items-center gap-1 text-sm text-ink-muted font-medium hover:text-ink"
      >
        <Plus size={13} />
        Add column
      </button>

      {/* Divider */}
      <div className="w-px h-4.5 bg-surface-sunk mx-1" />

      {/* Group by label */}
      <span className="text-xs text-ink-soft">Group by</span>

      {/* Group by select */}
      <select
        value={groupByFieldRef ?? ''}
        onChange={(e) => onGroupByChange(e.target.value || null)}
        className="text-xs font-medium border rounded-full px-2.5 py-1 bg-white text-ink-muted border-surface-sunk cursor-pointer"
      >
        <option value="">None</option>
        {groupableFields.map((f) => (
          <option key={f.ref} value={f.ref}>
            {f.name}
          </option>
        ))}
      </select>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stats */}
      <span className="text-xs text-ink-soft">
        {fields.length} fields · {rows.length} slots
      </span>

      {/* Divider */}
      <div className="w-px h-4.5 bg-surface-sunk mx-1" />

      {/* Save status */}
      <SaveStatus status={saveStatus} />

      {/* Live preview toggle */}
      <button
        onClick={onTogglePreview}
        aria-label={showPreview ? 'Hide live preview' : 'Show live preview'}
        className={[
          'flex items-center gap-1.5 text-xs font-medium border rounded-full px-2.5 py-1',
          showPreview
            ? 'bg-[rgb(31_111_235/0.10)] text-brand border-brand-soft'
            : 'bg-white text-ink-muted border-surface-sunk',
        ].join(' ')}
      >
        <Smartphone size={12} />
        Live preview
      </button>
    </div>
  );
}
