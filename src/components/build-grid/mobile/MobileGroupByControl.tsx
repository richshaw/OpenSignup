'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import { FIELD_TYPE_META } from '../fieldTypes';
import type { GridField } from '../useGridState';

type MobileGroupByControlProps = {
  fields: GridField[];
  value: string | null;
  onChange: (ref: string | null) => void;
};

export function MobileGroupByControl({ fields, value, onChange }: MobileGroupByControlProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const groupable = fields.filter(
    (f) => f.type === 'date' || f.type === 'text' || f.type === 'enum',
  );
  const active = value ? fields.find((f) => f.ref === value) ?? null : null;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const ActiveIcon = active ? FIELD_TYPE_META[active.type].icon : null;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-2 rounded-xl bg-surface-raised px-3 py-1.5"
    >
      <Layers size={13} className="text-ink-soft" aria-hidden="true" />
      <span className="flex-1 text-sm text-ink-muted">Group by</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
          active
            ? 'border-brand-soft bg-[rgb(31_111_235/0.10)] text-brand'
            : 'border-surface-sunk bg-white text-ink-muted',
        ].join(' ')}
      >
        {active && ActiveIcon ? (
          <>
            <ActiveIcon size={11} aria-hidden="true" />
            <span className="truncate max-w-[120px]">{active.name}</span>
          </>
        ) : (
          <>None</>
        )}
        <ChevronDown size={11} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-3 top-full z-30 mt-1 min-w-[180px] rounded-xl border border-surface-sunk bg-white p-1 shadow-[0_12px_32px_rgb(11_18_32/0.12)]"
        >
          <MenuRow
            label="None"
            active={!value}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          />
          {groupable.map((f) => {
            const Icon = FIELD_TYPE_META[f.type].icon;
            return (
              <MenuRow
                key={f.ref}
                label={f.name}
                icon={<Icon size={12} aria-hidden="true" />}
                active={value === f.ref}
                onClick={() => {
                  onChange(f.ref);
                  setOpen(false);
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MenuRow({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={[
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
        active ? 'bg-[rgb(31_111_235/0.10)] font-medium text-brand' : 'text-ink hover:bg-surface-raised',
      ].join(' ')}
    >
      {icon ?? <span className="inline-block w-3" />}
      {label}
    </button>
  );
}
