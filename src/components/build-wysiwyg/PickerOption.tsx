'use client';

import { Check } from 'lucide-react';

type PickerOptionProps = {
  active: boolean;
  label: string;
  onClick: () => void;
  /**
   * Shown before the label. Without one the option keeps a slot for a check
   * mark, shown when active, and the active option is bold and truncates.
   */
  icon?: React.ReactNode;
};

/** One option in a builder picker's listbox. */
export function PickerOption({ active, label, onClick, icon }: PickerOptionProps) {
  const checkStyle = icon === undefined;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={
        'flex w-full items-center gap-2 rounded-md border-none px-2.5 py-1.5 text-left text-xs cursor-pointer ' +
        (active
          ? `bg-brand-soft ${checkStyle ? 'font-semibold' : 'font-medium'} text-brand`
          : 'bg-transparent font-medium text-ink hover:bg-surface-raised')
      }
    >
      {checkStyle ? (
        <span className="inline-flex w-3 shrink-0">{active && <Check size={11} />}</span>
      ) : (
        <span className="inline-flex">{icon}</span>
      )}
      <span className={checkStyle ? 'flex-1 truncate' : 'flex-1'}>{label}</span>
    </button>
  );
}
