// A signup's status, or a sign-up's on the Responses tab. Anything not
// listed here is grey: closed, archived, cancelled, removed, moved.
const STYLES: Record<string, string> = {
  open: 'bg-success/10 text-success',
  confirmed: 'bg-success/10 text-success',
  draft: 'bg-warn/10 text-warn',
};

const FALLBACK = 'bg-ink-soft/10 text-ink-muted';

/**
 * `status` picks the colour; `label` is what it says, already in the page's
 * language (a sign-up's from `commitmentStatusLabel`). Without one it says
 * the stored word, as a signup's pill does until its text moves (#941).
 */
export function StatusPill({ status, label = status }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none ${STYLES[status] ?? FALLBACK}`}
    >
      {label}
    </span>
  );
}
