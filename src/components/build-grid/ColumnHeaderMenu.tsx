'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  Pencil,
  ArrowLeft,
  ArrowRight,
  ArrowLeftToLine,
  ArrowRightToLine,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

const MENU_WIDTH = 240;
const MENU_GAP = 4;
// 6 items × 28px + 22px section label + 2 × 9px dividers + 8px py-1 ≈ 216px.
// 24px headroom for safety. Bump if items are added.
const MENU_HEIGHT_ESTIMATE = 240;

type ColumnHeaderMenuProps = {
  anchorRef: RefObject<HTMLElement | null>;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onMoveStart: () => void;
  onMoveEnd: () => void;
  onDelete: () => void;
};

type MenuEntry =
  | { kind: 'item'; label: string; icon: LucideIcon; onClick: () => void; disabled: boolean; danger?: boolean }
  | { kind: 'divider' }
  | { kind: 'section'; label: string };

export function ColumnHeaderMenu({
  anchorRef,
  isFirst,
  isLast,
  onEdit,
  onMoveLeft,
  onMoveRight,
  onMoveStart,
  onMoveEnd,
  onDelete,
}: ColumnHeaderMenuProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const entries = useMemo<MenuEntry[]>(
    () => [
      { kind: 'item', label: 'Edit field…', icon: Pencil, onClick: onEdit, disabled: false },
      { kind: 'divider' },
      { kind: 'section', label: 'Reorder' },
      { kind: 'item', label: 'Move left', icon: ArrowLeft, onClick: onMoveLeft, disabled: isFirst },
      { kind: 'item', label: 'Move right', icon: ArrowRight, onClick: onMoveRight, disabled: isLast },
      { kind: 'item', label: 'Move to start', icon: ArrowLeftToLine, onClick: onMoveStart, disabled: isFirst },
      { kind: 'item', label: 'Move to end', icon: ArrowRightToLine, onClick: onMoveEnd, disabled: isLast },
      { kind: 'divider' },
      { kind: 'item', label: 'Delete field', icon: Trash2, onClick: onDelete, disabled: false, danger: true },
    ],
    [isFirst, isLast, onEdit, onMoveLeft, onMoveRight, onMoveStart, onMoveEnd, onDelete],
  );

  // Indexes (within `entries`) of items that can receive focus.
  const enabledItemIndexes = useMemo(
    () =>
      entries
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.kind === 'item' && !e.disabled)
        .map(({ i }) => i),
    [entries],
  );

  const [focusedIndex, setFocusedIndex] = useState<number>(() => enabledItemIndexes[0] ?? 0);

  // Reset focus to first enabled item when the enabled set changes.
  useEffect(() => {
    if (!enabledItemIndexes.includes(focusedIndex)) {
      setFocusedIndex(enabledItemIndexes[0] ?? 0);
    }
  }, [enabledItemIndexes, focusedIndex]);

  const itemRefs = useRef(new Map<number, HTMLButtonElement>());

  useLayoutEffect(() => {
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Right-align the menu with the column's right edge (where the chevron sits).
      const desiredLeft = rect.right - MENU_WIDTH;
      const left = Math.max(8, Math.min(desiredLeft, window.innerWidth - MENU_WIDTH - 8));
      // Flip above the chevron when there isn't room below.
      const willOverflow = rect.bottom + MENU_HEIGHT_ESTIMATE + 8 > window.innerHeight;
      const top = willOverflow
        ? Math.max(8, rect.top - MENU_HEIGHT_ESTIMATE - MENU_GAP)
        : rect.bottom + MENU_GAP;
      setPosition({ top, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);

  // Focus the active menu item once the menu is mounted and positioned.
  useLayoutEffect(() => {
    if (!mounted || position === null) return;
    itemRefs.current.get(focusedIndex)?.focus();
  }, [mounted, position, focusedIndex]);

  const moveFocus = (delta: 1 | -1) => {
    if (enabledItemIndexes.length === 0) return;
    const at = enabledItemIndexes.indexOf(focusedIndex);
    const next =
      at === -1
        ? enabledItemIndexes[0]!
        : enabledItemIndexes[(at + delta + enabledItemIndexes.length) % enabledItemIndexes.length]!;
    setFocusedIndex(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      const first = enabledItemIndexes[0];
      if (first !== undefined) setFocusedIndex(first);
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = enabledItemIndexes[enabledItemIndexes.length - 1];
      if (last !== undefined) setFocusedIndex(last);
    }
  };

  if (!mounted || position === null) return null;

  return createPortal(
    <div
      role="menu"
      data-column-header-menu
      onKeyDown={onKeyDown}
      style={{ position: 'fixed', top: position.top, left: position.left, width: MENU_WIDTH }}
      className="z-50 rounded-xl border border-surface-sunk bg-white py-1 shadow-card"
    >
      {entries.map((entry, i) => {
        if (entry.kind === 'divider') return <Divider key={`d-${i}`} />;
        if (entry.kind === 'section') return <SectionLabel key={`s-${i}`}>{entry.label}</SectionLabel>;
        return (
          <MenuItem
            key={entry.label}
            icon={entry.icon}
            label={entry.label}
            onClick={entry.onClick}
            disabled={entry.disabled}
            danger={entry.danger}
            tabIndex={focusedIndex === i ? 0 : -1}
            onMouseEnter={() => {
              if (!entry.disabled) setFocusedIndex(i);
            }}
            innerRef={(el) => {
              if (el) itemRefs.current.set(i, el);
              else itemRefs.current.delete(i);
            }}
          />
        );
      })}
    </div>,
    document.body,
  );
}

type MenuItemProps = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  tabIndex: number;
  onMouseEnter: () => void;
  innerRef: (el: HTMLButtonElement | null) => void;
};

function MenuItem({ icon: Icon, label, onClick, disabled, danger, tabIndex, onMouseEnter, innerRef }: MenuItemProps) {
  const textClass = disabled
    ? 'text-ink-soft/70'
    : danger
      ? 'text-danger'
      : 'text-ink';
  const iconClass = disabled ? 'text-ink-soft/70' : danger ? 'text-danger' : 'text-ink-muted';
  return (
    <button
      ref={innerRef}
      type="button"
      role="menuitem"
      tabIndex={tabIndex}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] ${textClass} ${
        disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-surface-raised'
      }`}
    >
      <Icon size={14} className={iconClass} />
      <span>{label}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-surface-sunk" />;
}
