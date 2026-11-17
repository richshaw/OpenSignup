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
 * language (a signup's from `signupStatusLabel`).
 */
export function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-none ${STYLES[status] ?? FALLBACK}`}
    >
      {label}
    </span>
  );
}
