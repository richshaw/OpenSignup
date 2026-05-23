'use client';

import { ExternalLink, Pencil, Settings } from 'lucide-react';
import { SaveStatus } from '../build-grid/SaveStatus';
import type { SaveStatus as SaveStatusType } from '../build-grid/useGridState';

type EditingRailProps = {
  fieldCount: number;
  fieldsOpen: boolean;
  onOpenFields: () => void;
  publicHref: string;
  saveStatus: SaveStatusType;
};

export function EditingRail({
  fieldCount,
  fieldsOpen,
  onOpenFields,
  publicHref,
  saveStatus,
}: EditingRailProps) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-2.5 rounded-t-xl border-b border-surface-sunk bg-white/95 backdrop-blur px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-brand">
          <Pencil size={10} />
          Editing
        </span>
        <SaveStatus status={saveStatus} />
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenFields}
          aria-expanded={fieldsOpen}
          aria-haspopup="dialog"
          className={
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors duration-180 ' +
            (fieldsOpen
              ? 'border-brand bg-brand-soft text-brand'
              : 'border-surface-sunk bg-white text-ink hover:bg-surface-raised')
          }
        >
          <Settings size={12} />
          <span>Fields ({fieldCount})</span>
        </button>
        <a
          href={publicHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-sunk bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-raised transition-colors duration-180"
        >
          <ExternalLink size={12} />
          Preview
        </a>
      </div>
    </div>
  );
}
