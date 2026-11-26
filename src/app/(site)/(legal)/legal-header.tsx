/**
 * A YYYY-MM-DD date as "19 November 2026". Throws on anything else, so a
 * mistyped date fails the build rather than showing a wrong "Last updated".
 * `source` names where the date is set, for the error.
 */
export function formatDay(iso: string, source = "PAGE_UPDATED in the page's file"): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const real =
    /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso;
  if (!real) {
    throw new Error(
      `A legal page date must be a real day written YYYY-MM-DD (${source}), not "${iso}"`,
    );
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** A legal page's title and its "Last updated" line, from a YYYY-MM-DD date. */
export function LegalHeader({ title, updated }: { title: string; updated: string }) {
  return (
    <header className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-ink-muted">Last updated: {formatDay(updated)}</p>
    </header>
  );
}
