'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Smartphone } from 'lucide-react';
import { SaveStatus } from './SaveStatus';
import { fieldTypeMeta } from './fieldTypes';
import type { GridField, GridRow, SaveStatus as SaveStatusType } from './useGridState';

type ToolbarProps = {
  fields: GridField[];
  rows: GridRow[];
  groupByFieldRef: string | null;
  onGroupByChange: (ref: string | null) => void;
  showPreview: boolean;
  onTogglePreview: () => void;
  saveStatus: SaveStatusType;
};

export function Toolbar({
  fields,
  rows,
  groupByFieldRef,
  onGroupByChange,
  showPreview,
  onTogglePreview,
  saveStatus,
}: ToolbarProps) {
  const [groupByOpen, setGroupByOpen] = useState(false);
  const groupByRef = useRef<HTMLDivElement>(null);

  const groupableFields = fields.filter(
    (f) => f.type === 'date' || f.type === 'text' || f.type === 'enum',
  );
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
      {/* Group by label */}
      <span className="text-xs text-ink-muted">Group by</span>

      {/* Group by pill */}
      <div ref={groupByRef} className="relative">
        {activeField ? (() => {
          const ActiveIcon = fieldTypeMeta(activeField.type).icon;
          return (
            <button
              onClick={() => setGroupByOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={groupByOpen}
              aria-label={`Group by ${activeField.name} — click to change`}
              className="flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-1 bg-[rgb(31_111_235/0.10)] text-brand border-brand-soft max-w-[200px]"
            >
              <ActiveIcon size={11} className="shrink-0" />
              <span className="truncate min-w-0">{activeField.name}</span>
              <ChevronDown size={11} className="shrink-0" />
            </button>
          );
        })() : (
          <button
            onClick={() => setGroupByOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={groupByOpen}
            className="flex items-center gap-1 text-xs font-semibold border rounded-full px-2.5 py-1 bg-white text-ink-muted border-surface-sunk max-w-[200px]"
          >
            None
            <ChevronDown size={11} className="shrink-0" />
          </button>
        )}

        {groupByOpen && (
          <div
            role="menu"
            className="absolute top-full left-0 mt-1 z-50 bg-white border border-surface-sunk rounded-lg shadow-card p-1 min-w-[200px]"
          >
            <button
              role="menuitemradio"
              aria-checked={!activeField}
              onClick={() => {
                onGroupByChange(null);
                setGroupByOpen(false);
              }}
              className={[
                'flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-md text-xs',
                !activeField
                  ? 'bg-[rgb(31_111_235/0.10)] text-brand font-semibold'
                  : 'text-ink font-medium hover:bg-surface-raised',
              ].join(' ')}
            >
              <span className="w-3 shrink-0" />
              None
            </button>
            {groupableFields.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-ink-muted leading-snug">
                Add a date, text, or list field to group slots.
              </div>
            ) : (
              groupableFields.map((f) => {
                const Icon = fieldTypeMeta(f.type).icon;
                const active = activeField?.ref === f.ref;
                return (
                  <button
                    key={f.ref}
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onGroupByChange(f.ref);
                      setGroupByOpen(false);
                    }}
                    className={[
                      'flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-md text-xs',
                      active
                        ? 'bg-[rgb(31_111_235/0.10)] text-brand font-semibold'
                        : 'text-ink font-medium hover:bg-surface-raised',
                    ].join(' ')}
                  >
                    <Icon size={12} className="shrink-0" />
                    <span className="truncate min-w-0">{f.name}</span>
                  </button>
                );
              })
            )}
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
