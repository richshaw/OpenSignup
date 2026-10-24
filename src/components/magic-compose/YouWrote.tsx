import { Text as TextIcon } from 'lucide-react';

/**
 * The organizer's description, quoted back to them: in a box while the first
 * reply comes (`box`), as one line above the questions (`line`), and at the
 * top of the Drafting from card (`plain`). One component so the three can't
 * drift apart.
 */
export function YouWrote({
  prompt,
  variant,
}: {
  prompt: string;
  variant: 'box' | 'line' | 'plain';
}) {
  const quoted = `“${prompt.trim()}”`;
  const line = variant === 'line';
  const text = line ? (
    <p className="line-clamp-2 min-w-0 text-[15px] leading-snug">
      <span className="text-ink-muted">You wrote </span>
      <span className="font-semibold">{quoted}</span>
    </p>
  ) : (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-ink-muted">You wrote</span>
      <p className="line-clamp-3 text-lg font-semibold leading-snug tracking-tight">{quoted}</p>
    </div>
  );

  if (variant === 'plain') return <div className="px-4 pb-3.5 pt-4">{text}</div>;

  return (
    <section
      aria-label="Your description"
      className={`flex items-center rounded-lg border border-brand-soft bg-brand/5 ${
        line ? 'gap-3 px-3 py-2' : 'gap-3.5 px-3.5 py-3'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex-shrink-0 items-center justify-center border border-brand-soft bg-white text-brand ${
          line
            ? 'hidden h-8 w-8 rounded-[9px] sm:inline-flex'
            : 'inline-flex h-10 w-10 rounded-[11px]'
        }`}
      >
        <TextIcon className="h-4 w-4" />
      </span>
      {text}
    </section>
  );
}
