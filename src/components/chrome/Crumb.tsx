import Link from 'next/link';

/** What goes between two crumbs: a mark, not a word, so the same in every language. */
const SEPARATOR = '›';

/** How a crumb before the current page shrinks, the site's name included; see `Crumb`. */
export const EARLIER_CRUMB = 'min-w-0 shrink-[10] truncate';

/**
 * One crumb in the organizer header's trail, after a separator. On a narrow
 * screen the trail shares its row with Help, Account and Sign out, so every
 * crumb may shorten with "…" (`min-w-0` lets a flex item get narrower than
 * its words) while the separators keep their room. The crumbs before the
 * current page give way first (`EARLIER_CRUMB`, ten times its rate), so the
 * current page stays readable longest. Its own rate stays 1: once the others
 * are used up, a rate below 1 would take only that share of what's still
 * too wide, and the rest would spill. The whole label stays in the page for
 * screen readers.
 */
export function Crumb({
  href,
  children,
  lang,
}: {
  href?: string;
  children: React.ReactNode;
  /** The crumb's language, where it isn't the trail's: a signup's title is in the signup's. */
  lang?: string | undefined;
}) {
  const label = href ? (
    <Link href={href} lang={lang} className={`${EARLIER_CRUMB} hover:text-ink hover:underline`}>
      {children}
    </Link>
  ) : (
    <span lang={lang} className="min-w-0 truncate font-medium text-ink" aria-current="page">
      {children}
    </span>
  );
  return (
    <>
      <span className="shrink-0 text-ink-soft" aria-hidden="true">
        {SEPARATOR}
      </span>
      {label}
    </>
  );
}
