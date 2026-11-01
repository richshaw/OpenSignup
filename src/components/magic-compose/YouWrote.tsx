/**
 * The shell of the white card that quotes the description: alone while the
 * first reply comes, and as the Drafting from card once there are answers.
 * Written once so the two can't drift apart.
 */
export const DESCRIPTION_CARD =
  'overflow-hidden rounded-lg border border-surface-sunk bg-white shadow-sm';

/** The padding around "You wrote" inside the card, in both places. */
export const YOU_WROTE_PADDING = 'px-4 pb-3.5 pt-4';

/**
 * The organizer's description, quoted back to them: in the description card
 * while the first reply comes (`card`), and as plain text above the questions
 * and inside the Drafting from card (`plain`), where lines already divide the
 * panel. The caller pads `plain`. One component so the two can't drift apart.
 */
export function YouWrote({ prompt, variant }: { prompt: string; variant: 'card' | 'plain' }) {
  const quoted = `“${prompt.trim()}”`;
  const text = (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-medium text-ink-muted">You wrote</span>
      <p className="line-clamp-3 text-lg font-semibold leading-snug tracking-tight">{quoted}</p>
    </div>
  );

  if (variant === 'plain') return text;

  return (
    <section aria-label="Your description" className={`${DESCRIPTION_CARD} ${YOU_WROTE_PADDING}`}>
      {text}
    </section>
  );
}
