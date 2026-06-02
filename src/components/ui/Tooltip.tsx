'use client';

import {
  cloneElement,
  useId,
  useState,
  type ReactElement,
} from 'react';

type TooltipProps = {
  label: string;
  side?: 'top' | 'bottom';
  children: ReactElement<{ 'aria-describedby'?: string }>;
};

export function Tooltip({ label, side = 'bottom', children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  const popoverClass = open
    ? `pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-white ${
        side === 'bottom' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]'
      }`
    : 'sr-only';

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span id={id} role="tooltip" className={popoverClass}>
        {label}
      </span>
    </span>
  );
}
