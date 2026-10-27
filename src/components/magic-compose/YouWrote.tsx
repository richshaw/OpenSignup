import { Text as TextIcon } from 'lucide-react';

/**
 * The organizer's description, quoted back to them: in a box while the first
 * reply comes and above the questions (`box`), and at the top of the Drafting
 * from card (`plain`). One component so the two can't drift apart.
 */
export function YouWrote({ prompt, variant }: { prompt: string; variant: 'box' | 'plain' }) {
  const quoted = `“${prompt.trim()}”`;
  const text = (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-ink-muted">You wrote</span>
      <p className="line-clamp-3 text-lg font-semibold leading-snug tracking-tight">{quoted}</p>
    </div>
  );

  if (variant === 'plain') return <div className="px-4 pb-3.5 pt-4">{text}</div>;

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
