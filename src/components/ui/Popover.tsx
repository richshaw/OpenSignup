'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useOutsideClose } from '@/hooks/useOutsideClose';

type PopoverProps = {
  open: boolean;
  /**
   * Asks the caller to close it: on Escape, a mousedown outside the panel and
   * its trigger, or focus moving to something outside both. A caller with
   * work in flight can ignore it to hold the panel open.
   */
  onClose: () => void;
  /**
   * The button that opens it, which the caller renders with `aria-haspopup`
   * and `aria-expanded`. A click on it isn't outside, and focus goes back to
   * it when the panel closes by Escape or from a button inside.
   */
  triggerRef: RefObject<HTMLElement | null>;
  /**
   * What takes focus when the panel opens. The panel itself, if left out,
   * and nothing when a child already put focus inside as it mounted.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** The dialog's name, when no heading inside it can give one. */
  label?: string;
  /** The id of a heading inside that names the dialog. */
  labelledBy?: string;
  /** The id of the text inside that describes it, read out as it opens. */
  describedBy?: string;
  /** The panel's width and padding. */
  className?: string;
  children: ReactNode;
};

/**
 * A panel anchored under its trigger, right-aligned, over the page: a
 * non-modal dialog, so the rest of the page stays usable and a click there
 * closes it. The caller wraps the trigger and this in a `relative` box.
 */
export function Popover({
  open,
  onClose,
  triggerRef,
  initialFocusRef,
  label,
  labelledBy,
  describedBy,
  className = '',
  children,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Off when a click or focus elsewhere closes the panel: focus is going
  // where the person put it, so it isn't pulled back to the trigger. Back on
  // whenever focus is inside again.
  const returnFocus = useRef(true);
  const latest = useRef({ onClose, triggerRef, initialFocusRef });
  useEffect(() => {
    latest.current = { onClose, triggerRef, initialFocusRef };
  });

  useOutsideClose(
    open,
    [panelRef, triggerRef],
    () => {
      returnFocus.current = false;
      latest.current.onClose();
    },
    { focus: true },
  );

  useEffect(() => {
    if (!open) return;
    returnFocus.current = true;
    // Unless something inside took focus as it mounted, which runs first.
    if (!panelRef.current?.contains(document.activeElement)) {
      (latest.current.initialFocusRef?.current ?? panelRef.current)?.focus();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') latest.current.onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Runs when the panel closes, and when it unmounts with its trigger,
      // whose ref is null by then, so nothing takes focus.
      if (returnFocus.current) latest.current.triggerRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      tabIndex={-1}
      onFocus={() => {
        returnFocus.current = true;
      }}
      className={`absolute right-0 top-[calc(100%+8px)] z-30 rounded-lg border border-surface-sunk bg-white shadow-card ${className}`}
    >
      {children}
    </div>
  );
}
