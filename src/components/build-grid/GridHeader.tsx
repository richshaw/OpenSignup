'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, GripVertical } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { buildColsTemplate } from './columnSizing';
import { fieldTypeMeta } from './fieldTypes';
import { ResizeHandle } from './ResizeHandle';
import { useReorderable } from './useReorderable';
import type { GridField } from './useGridState';

interface GridHeaderProps {
  fields: GridField[];
  onEditField: (field: GridField) => void;
  onAddField: () => void;
  onDeleteField: (fieldId: string) => void;
  onMoveField: (fieldId: string, toIdx: number) => void;
  onResize: (fieldId: string, width: number) => void;
  onResetWidth: (fieldId: string) => void;
}

const ANNOUNCEMENT_TTL_MS = 1500;

export function GridHeader({
  fields,
  onEditField,
  onAddField,
  // onDeleteField retained for callers; deletion routes through the FieldEditor opened from the pencil.
  onDeleteField: _onDeleteField,
  onMoveField,
  onResize,
  onResetWidth,
}: GridHeaderProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const reorder = useReorderable({
    items: fields,
    onReorder: (from, to) => {
      const moved = fields[from];
      if (!moved) return;
      onMoveField(moved.id, to);
      setAnnouncement(`Field ${moved.name} moved to position ${to + 1} of ${fields.length}.`);
    },
  });

  // Clear stale announcements so screen readers re-announce a repeat reorder.
  useEffect(() => {
    if (!announcement) return;
    const id = setTimeout(() => setAnnouncement(''), ANNOUNCEMENT_TTL_MS);
    return () => clearTimeout(id);
  }, [announcement]);

  const moveBy = (fieldId: string, delta: -1 | 1) => {
    const fromIdx = fields.findIndex((f) => f.id === fieldId);
    if (fromIdx < 0) return;
    const toIdx = fromIdx + delta;
    if (toIdx < 0 || toIdx >= fields.length) return;
    onMoveField(fieldId, toIdx);
    const moved = fields[fromIdx];
    if (moved) setAnnouncement(`Field ${moved.name} moved to position ${toIdx + 1} of ${fields.length}.`);
  };

  const moveTo = (fieldId: string, toIdx: number) => {
    const fromIdx = fields.findIndex((f) => f.id === fieldId);
    if (fromIdx < 0 || fromIdx === toIdx) return;
    onMoveField(fieldId, toIdx);
    const moved = fields[fromIdx];
    if (moved) setAnnouncement(`Field ${moved.name} moved to position ${toIdx + 1} of ${fields.length}.`);
  };

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: buildColsTemplate(fields),
          borderBottom: '1px solid #eef1f5',
        }}
        className="bg-surface-raised"
      >
        {/* Leading # column — 38px */}
        <div className="flex items-center justify-center px-2 py-2 border-r border-surface-sunk">
          <span className="text-[11px] text-ink-soft font-mono">#</span>
        </div>

        {/* Field columns */}
        {fields.map((f, i) => {
          const meta = fieldTypeMeta(f.type);
          const TypeIcon = meta.icon;
          const isHover = hoverId === f.id;
          const isDragging = reorder.dragId === f.id;
          const isDropTarget =
            reorder.overId === f.id && reorder.dragId !== null && reorder.dragId !== f.id;
          const sourceProps = reorder.source(f.id);
          const targetProps = reorder.target(f.id);

          return (
            <div
              key={f.id}
              {...targetProps}
              onMouseEnter={() => setHoverId(f.id)}
              onMouseLeave={() => setHoverId((cur) => (cur === f.id ? null : cur))}
              style={{
                position: 'relative',
                borderLeft: isDropTarget ? '2px solid var(--brand)' : '2px solid transparent',
                marginLeft: isDropTarget ? -2 : 0,
                opacity: isDragging ? 0.5 : 1,
              }}
              className={`flex items-center border-r border-surface-sunk transition-colors ${
                isDragging ? 'bg-brand-soft' : ''
              }`}
            >
              {/* Type icon doubles as the drag handle. Hover swaps to GripVertical
                  so the affordance is obvious without permanent visual noise. */}
              <span
                {...sourceProps}
                role="button"
                aria-label={`Drag to reorder ${f.name}`}
                title="Drag to reorder"
                className="ml-2 inline-flex h-[22px] w-[22px] flex-shrink-0 cursor-grab items-center justify-center rounded text-brand"
              >
                {isHover ? <GripVertical size={12} /> : <TypeIcon size={12} />}
              </span>

              {/* Field name — plain label, not interactive. */}
              <span className="flex-1 min-w-0 truncate px-1.5 text-[13px] font-medium text-ink">
                {f.name}
              </span>

              {/* Pencil button — opens FieldEditor; keyboard reorder when focused.
                  Stops mousedown so a press on the pencil can never initiate a drag
                  on the parent. */}
              <button
                type="button"
                data-column-header-edit
                onClick={() => onEditField(f)}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
                onKeyDown={(e) => {
                  if (!(e.metaKey || e.ctrlKey)) return;
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    moveBy(f.id, -1);
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    moveBy(f.id, 1);
                  } else if (e.key === 'Home') {
                    e.preventDefault();
                    moveTo(f.id, 0);
                  } else if (e.key === 'End') {
                    e.preventDefault();
                    moveTo(f.id, fields.length - 1);
                  }
                }}
                aria-label={`Edit field ${f.name}. Use Cmd or Ctrl plus arrow keys to reorder.`}
                aria-keyshortcuts="Meta+ArrowLeft Meta+ArrowRight Control+ArrowLeft Control+ArrowRight Meta+Home Meta+End Control+Home Control+End"
                title="Edit field"
                className={`mr-2 inline-flex h-[22px] flex-shrink-0 items-center justify-center rounded border transition-colors ${
                  isHover
                    ? 'border-surface-sunk bg-white text-ink-muted hover:text-ink'
                    : 'border-transparent bg-transparent text-ink-soft/60'
                }`}
                style={{ width: 22 }}
              >
                <Pencil size={12} />
              </button>

              <ResizeHandle
                field={f}
                fieldIndex={i}
                onResize={(width) => onResize(f.id, width)}
                onReset={() => onResetWidth(f.id)}
              />
            </div>
          );
        })}

        {/* Trailing Capacity header — 90px */}
        <div className="flex items-center justify-center gap-1 px-2 py-2 border-r border-surface-sunk">
          <span className="text-[13px] font-medium text-ink truncate">Cap.</span>
          <Tooltip label="Maximum number of people who can sign up for this slot.">
            <span
              tabIndex={0}
              role="img"
              aria-label="About the Cap column"
              className="inline-flex h-[13px] w-[13px] cursor-help items-center justify-center rounded-full border border-ink-soft text-[9px] font-bold leading-none text-ink-soft"
            >
              i
            </span>
          </Tooltip>
        </div>

        {/* Trailing labeled "+ Add field" link — 130px. */}
        <button
          type="button"
          onClick={onAddField}
          aria-label="Add field"
          className="flex h-full w-full items-center justify-end gap-1.5 border-l border-surface-sunk px-3 text-sm font-medium text-ink-muted hover:bg-surface-sunk/50 hover:text-ink transition-colors"
        >
          <Plus size={13} />
          Add field
        </button>
      </div>

      {/* aria-live for drag/keyboard reorder. Visually hidden, polite. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-grid-header-announcement
      >
        {announcement}
      </div>
    </>
  );
}
