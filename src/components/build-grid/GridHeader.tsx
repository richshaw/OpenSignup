'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { buildColsTemplate } from './columnSizing';
import { ColumnHeaderMenu } from './ColumnHeaderMenu';
import { fieldTypeMeta } from './fieldTypes';
import { ResizeHandle } from './ResizeHandle';
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

const FLASH_MS = 700;

export function GridHeader({
  fields,
  onEditField,
  onAddField,
  onDeleteField,
  onMoveField,
  onResize,
  onResetWidth,
}: GridHeaderProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [justMovedId, setJustMovedId] = useState<string | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

  const setButtonRef = useCallback((id: string) => (el: HTMLButtonElement | null) => {
    if (el) buttonRefs.current.set(id, el);
    else buttonRefs.current.delete(id);
  }, []);

  const closeMenu = useCallback(() => {
    setOpenMenuId((prev) => {
      if (prev) buttonRefs.current.get(prev)?.focus();
      return null;
    });
  }, []);

  // Close on outside click + Esc while a menu is open. The menu lives in a
  // portal under document.body, so we identify it via [data-column-header-menu]
  // rather than DOM-tree containment. `pointerdown` covers mouse, touch, and pen.
  useEffect(() => {
    if (openMenuId === null) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-column-header-button]')) return;
      if (target.closest('[data-column-header-menu]')) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenuId, closeMenu]);

  // Clear flash highlight after a short delay.
  useEffect(() => {
    if (justMovedId === null) return;
    const id = setTimeout(() => setJustMovedId(null), FLASH_MS);
    return () => clearTimeout(id);
  }, [justMovedId]);

  const move = (fieldId: string, toIdx: number) => {
    onMoveField(fieldId, toIdx);
    setJustMovedId(fieldId);
    closeMenu();
  };

  // Anchor ref is stable per `openMenuId` — only one menu is open at a time, so
  // we don't need a per-field ref. Rebuilding only on `openMenuId` change keeps
  // the menu's resize/scroll listeners attached exactly once per open.
  const anchorRef = useMemo(
    () => ({
      get current() {
        return openMenuId ? buttonRefs.current.get(openMenuId) ?? null : null;
      },
    }),
    [openMenuId],
  );

  return (
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
        const Icon = meta.icon;
        const isOpen = openMenuId === f.id;
        const isFlashing = justMovedId === f.id;
        const headerBg = isOpen
          ? 'bg-brand-soft'
          : isFlashing
            ? 'bg-brand-soft/60'
            : '';
        return (
          <div
            key={f.id}
            style={{ position: 'relative' }}
            className={`flex items-center border-r border-surface-sunk transition-colors ${headerBg}`}
          >
            <button
              ref={setButtonRef(f.id)}
              type="button"
              data-column-header-button
              onClick={() => setOpenMenuId((cur) => (cur === f.id ? null : f.id))}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              className="flex flex-1 items-center gap-1.5 px-2 py-2 text-left min-w-0 overflow-hidden text-ellipsis"
            >
              <Icon size={12} className="text-brand flex-shrink-0" />
              <span className="text-[13px] font-medium text-ink truncate">{f.name}</span>
              <span
                aria-hidden
                className={`ml-auto flex flex-shrink-0 items-center justify-center rounded px-1 py-0.5 ${
                  isOpen ? 'bg-brand/15 text-brand' : 'text-ink-soft'
                }`}
              >
                <ChevronDown size={11} />
              </span>
            </button>
            <ResizeHandle
              field={f}
              fieldIndex={i}
              onResize={(width) => onResize(f.id, width)}
              onReset={() => onResetWidth(f.id)}
            />
            {isOpen && (
              <ColumnHeaderMenu
                anchorRef={anchorRef}
                isFirst={i === 0}
                isLast={i === fields.length - 1}
                onEdit={() => {
                  closeMenu();
                  onEditField(f);
                }}
                onMoveLeft={() => move(f.id, i - 1)}
                onMoveRight={() => move(f.id, i + 1)}
                onMoveStart={() => move(f.id, 0)}
                onMoveEnd={() => move(f.id, fields.length - 1)}
                onDelete={() => {
                  closeMenu();
                  onDeleteField(f.id);
                }}
              />
            )}
          </div>
        );
      })}

      {/* Trailing Capacity header — 90px */}
      <div className="flex items-center justify-center px-2 py-2 border-r border-surface-sunk">
        <span className="text-[13px] font-medium text-ink truncate">Cap.</span>
      </div>

      {/* Trailing labeled "+ Add field" link — 130px. Right-aligned to match
          the per-row trailing actions cell. */}
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
  );
}
