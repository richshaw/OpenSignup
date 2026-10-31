import type { ReactNode } from 'react';

/**
 * The centred card a page shows in place of its content when there is
 * nothing to show: a participant's signup that isn't available
 * (`SignupStateMessage`), or an organizer's signup that can't be opened
 * (`SignupLoadError`). One card, so the two can't drift. `detail`, a line
 * under the title, names the slot when there is one; `children` are the
 * actions under the body. Lines are balanced, so a heading never leaves one
 * word on a line of its own.
 */
export function StateCard({
  title,
  detail,
  body,
  className = '',
  children,
}: {
  title: string;
  detail?: string;
  body: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`w-full space-y-3 rounded-xl border border-surface-sunk bg-white p-8 text-center ${className}`}
    >
      <h1 className="text-balance text-xl font-semibold tracking-tight">{title}</h1>
      {detail ? <p className="text-balance text-sm font-medium">{detail}</p> : null}
      <p className="text-balance text-sm text-ink-muted">{body}</p>
      {children}
    </div>
  );
}
