'use client';

import { Pencil, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SaveStatus } from '../build-shared/SaveStatus';
import type { SaveStatus as SaveStatusType } from '../build-shared/useBuildState';

type EditingRailProps = {
  fieldCount: number;
  fieldsOpen: boolean;
  onOpenFields: () => void;
  saveStatus: SaveStatusType;
};

export function EditingRail({
  fieldCount,
  fieldsOpen,
  onOpenFields,
  saveStatus,
}: EditingRailProps) {
  const t = useTranslations('organizer.build.rail');
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-2.5 rounded-t-xl border-b border-surface-sunk bg-white/95 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2">
        {/* The darker blue: the brand's own is 3.7:1 on its tint, under AA's
            4.5:1 for text this small. */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-brand-hover">
          <Pencil size={10} />
          {t('editing')}
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
          <span>{t('fields', { count: fieldCount })}</span>
        </button>
      </div>
    </div>
  );
}
