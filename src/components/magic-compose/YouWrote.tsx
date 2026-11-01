import type { ReactNode } from 'react';

/**
 * The padding of the panel's first band, which quotes the description on every
 * Magic Compose screen: reading, the questions, and drafting with or without
 * answers. Written once so "You wrote" sits in the same place on all of them.
 */
export const YOU_WROTE_BAND = 'p-4 sm:px-6 sm:py-5';

/** The full-width line under that band, as the questions screen draws it. */
export const BAND_DIVIDER = 'border-b border-surface-sunk';

/**
 * The organizer's description, quoted back to them. `band` is the panel's
 * first band on its own (while the first reply comes, and while a draft with no
 * questions runs); `plain` is the text alone, for a caller that draws the band
 * itself (the questions, and Drafting from with its answers under the quote).
 * `aside` sits on the right of "You wrote". No card: the panel is the card.
 */
export function YouWrote({
  prompt,
  variant,
  aside,
}: {
  prompt: string;
  variant: 'band' | 'plain';
  aside?: ReactNode;
}) {
  const quoted = `“${prompt.trim()}”`;
  const text = (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium text-ink-muted">You wrote</span>
        {aside}
      </div>
      <p className="line-clamp-3 text-lg font-semibold leading-snug tracking-tight">{quoted}</p>
    </div>
  );

  if (variant === 'plain') return text;

  return (
    <section aria-label="Your description" className={`${YOU_WROTE_BAND} ${BAND_DIVIDER}`}>
      {text}
    </section>
  );
}
