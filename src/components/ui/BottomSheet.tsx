'use client';

import { type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** When true, omit the bottom border under the title (matches design's `compact` sheet). */
  compact?: boolean;
  children: ReactNode;
};

/**
 * Bottom-sheet on `<md`, centred card on `≥md`. Uses Radix Dialog so backdrop tap,
 * Escape, focus trap, and aria-modal all work for free.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  compact = false,
  children,
}: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(11_18_32/0.35)] backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
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
          {/* Drag handle (mobile only) */}
          <div className="flex justify-center pt-2 pb-1 md:hidden">
            <div className="h-1 w-9 rounded-full bg-surface-sunk" />
          </div>

          {title ? (
            <div
              className={[
                'flex items-center justify-between px-4 pt-1 pb-2.5 md:px-5 md:pt-5 md:pb-3',
                compact ? '' : 'border-b border-surface-sunk',
              ].join(' ')}
            >
              <Dialog.Title className="truncate text-base font-semibold text-ink md:text-lg">
                {title}
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-soft hover:bg-surface-raised"
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
