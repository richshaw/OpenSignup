'use client';

import { type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  /**
   * The sheet's heading, and the accessible name Radix gives the dialog. A
   * node, not just a string, so a caller can name the dialog more fully than
   * it labels it on screen — an `sr-only` span joined to an `aria-hidden` one.
   */
  title?: ReactNode;
  /**
   * A short line beside the title, such as "2 of 4 spots left". It sits
   * outside the heading, so the dialog's name stays the title's, and it
   * becomes the dialog's accessible description, read out when it opens.
   */
  description?: ReactNode;
  /**
   * An id for the description's text, so a field inside the sheet can be
   * described by it too. The dialog's own link to it is Radix's.
   */
  descriptionId?: string;
  /** When true, omit the bottom border under the title (matches design's `compact` sheet). */
  compact?: boolean;
  /**
   * Work in flight that must not be abandoned. The caller is expected to hold
   * the sheet open by ignoring `onClose`; this greys out the close X to match,
   * so the control looks as inert as it behaves.
   */
  busy?: boolean;
  /**
   * Radix focuses the sheet's first tabbable element on open — the close X.
   * Pass a handler that calls `preventDefault()` and focuses something else to
   * land the caret on a particular field instead.
   */
  onOpenAutoFocus?: (event: Event) => void;
  children: ReactNode;
};

/**
 * Bottom-sheet on `<md`, centred card on `≥md`. Uses Radix Dialog so backdrop tap,
 * Escape, focus trap, hiding the rest of the page from assistive tech, and body
 * scroll-lock all work for free.
 *
 * The scroll-lock is what keeps this a sheet rather than a toast on a phone:
 * without it the page carries on scrolling under the backdrop, so the row you
 * tapped slides away while you are filling the sheet in.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  descriptionId,
  compact = false,
  busy = false,
  onOpenAutoFocus,
  children,
}: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(11_18_32/0.35)] backdrop-blur-sm" />
        <Dialog.Content
          // With no description, say so; with one, Radix links it.
          {...(description ? {} : { 'aria-describedby': undefined })}
          {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
          className={[
            'fixed z-50 bg-white flex flex-col overflow-hidden',
            // mobile: bottom sheet
            'inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl',
            'pb-[calc(env(safe-area-inset-bottom)+16px)]',
            // desktop: centred card
            'md:inset-auto md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
            'md:max-h-[85vh] md:w-[460px] md:max-w-[calc(100vw-2rem)] md:rounded-2xl md:pb-0',
            'md:shadow-[0_12px_48px_rgb(11_18_32/0.18)]',
          ].join(' ')}
        >
          {title ? (
            <div
              className={[
                'flex items-center justify-between px-4 pt-5 pb-2.5 md:px-5 md:pb-3',
                compact ? '' : 'border-b border-surface-sunk',
              ].join(' ')}
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                {/* Wraps to two lines rather than truncating: this heading is
                    often the only place the sheet names what it is acting on,
                    and one clipped line at 390px loses the end of it. */}
                <Dialog.Title className="line-clamp-2 min-w-0 text-base font-semibold text-ink md:text-lg">
                  {title}
                </Dialog.Title>
                {/* Kept whole, beside a short title; a long one keeps the
                    full width for its two lines and this drops below it,
                    rather than splitting or being clamped away. */}
                {description ? (
                  <Dialog.Description className="shrink-0 whitespace-nowrap text-sm text-ink-muted">
                    <span id={descriptionId}>{description}</span>
                  </Dialog.Description>
                ) : null}
              </div>
              <Dialog.Close
                aria-label="Close"
                disabled={busy}
                className="-mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-surface-raised disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <X size={16} aria-hidden="true" />
              </Dialog.Close>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto px-4 pb-5 pt-3 md:px-5">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
