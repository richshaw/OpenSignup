'use client';

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
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

  useLayoutEffect(() => {
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Right-align the menu with the column's right edge (where the chevron sits).
      const desiredLeft = rect.right - MENU_WIDTH;
      const left = Math.max(8, Math.min(desiredLeft, window.innerWidth - MENU_WIDTH - 8));
      setPosition({ top: rect.bottom + MENU_GAP, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);

  if (!mounted || position === null) return null;

  return createPortal(
    <div
      role="menu"
      data-column-header-menu
      style={{ position: 'fixed', top: position.top, left: position.left, width: MENU_WIDTH }}
      className="z-50 rounded-xl border border-surface-sunk bg-white py-1 shadow-card"
    >
      <MenuItem icon={Pencil} label="Edit field…" onClick={onEdit} />
      <Divider />
      <SectionLabel>Reorder</SectionLabel>
      <MenuItem icon={ArrowLeft} label="Move left" onClick={onMoveLeft} disabled={isFirst} />
      <MenuItem icon={ArrowRight} label="Move right" onClick={onMoveRight} disabled={isLast} />
      <MenuItem
        icon={ArrowLeftToLine}
        label="Move to start"
        onClick={onMoveStart}
        disabled={isFirst}
      />
      <MenuItem
        icon={ArrowRightToLine}
        label="Move to end"
        onClick={onMoveEnd}
        disabled={isLast}
      />
      <Divider />
      <MenuItem icon={Trash2} label="Delete column" onClick={onDelete} danger />
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
};

function MenuItem({ icon: Icon, label, onClick, disabled, danger }: MenuItemProps) {
  const textClass = disabled
    ? 'text-ink-soft/70'
    : danger
      ? 'text-danger'
      : 'text-ink';
  const iconClass = disabled ? 'text-ink-soft/70' : danger ? 'text-danger' : 'text-ink-muted';
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
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
