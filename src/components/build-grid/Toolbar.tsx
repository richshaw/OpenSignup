'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, ChevronDown, Smartphone, X } from 'lucide-react';
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
  const [groupByOpen, setGroupByOpen] = useState(false);
  const groupByRef = useRef<HTMLDivElement>(null);

  const groupableFields = fields.filter((f) => f.type === 'date' || f.type === 'text');
  const activeField = groupByFieldRef
    ? fields.find((f) => f.ref === groupByFieldRef)
    : null;

  useEffect(() => {
    if (!groupByOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (groupByRef.current && !groupByRef.current.contains(e.target as Node)) {
        setGroupByOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [groupByOpen]);

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

      {/* Group by pill */}
      <div ref={groupByRef} className="relative">
        {activeField ? (
          <div className="inline-flex items-center border rounded-full bg-[rgb(31_111_235/0.10)] border-brand-soft">
            <button
              onClick={() => setGroupByOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 text-xs font-medium text-brand bg-transparent border-none cursor-pointer font-[inherit]"
              aria-label={`Group by ${activeField.name} — click to change`}
            >
              {activeField.name}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGroupByChange(null);
                setGroupByOpen(false);
              }}
              className="inline-flex items-center pr-2 py-1 text-brand bg-transparent border-none cursor-pointer"
              aria-label="Clear group by"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setGroupByOpen((o) => !o)}
            className="flex items-center gap-1 text-xs font-medium border rounded-full px-2.5 py-1 bg-white text-ink-muted border-surface-sunk"
          >
            None
            <ChevronDown size={11} />
          </button>
        )}

        {groupByOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-surface-sunk rounded-lg shadow-md py-1 min-w-[140px]">
            <button
              onClick={() => {
                onGroupByChange(null);
                setGroupByOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-ink-muted hover:bg-surface-raised"
            >
              None
            </button>
            {groupableFields.map((f) => (
              <button
                key={f.ref}
                onClick={() => {
                  onGroupByChange(f.ref);
                  setGroupByOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-raised"
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

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
