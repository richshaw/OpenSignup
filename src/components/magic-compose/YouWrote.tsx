import { Text as TextIcon } from 'lucide-react';

/**
 * The organizer's description, quoted back to them: in a box while the first
 * reply comes (`box`), and as plain text above the questions and at the top of
 * the Drafting from card (`plain`), where lines already divide the panel and a
 * box inside them would read as a banner. The caller pads `plain`. One
 * component so the two can't drift apart.
 */
export function YouWrote({ prompt, variant }: { prompt: string; variant: 'box' | 'plain' }) {
  const quoted = `“${prompt.trim()}”`;
  const text = (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-medium text-ink-muted">You wrote</span>
      <p className="line-clamp-3 text-lg font-semibold leading-snug tracking-tight">{quoted}</p>
    </div>
  );

  if (variant === 'plain') return text;

  return (
    <section
      aria-label="Your description"
      className="flex items-center gap-3.5 rounded-lg border border-brand-soft bg-brand/5 px-3.5 py-3"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] border border-brand-soft bg-white text-brand"
      >
        <TextIcon className="h-4 w-4" />
      </span>
      {text}
    </section>
  );
}
