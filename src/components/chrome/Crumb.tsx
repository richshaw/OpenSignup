import Link from 'next/link';

/** What goes between two crumbs: a mark, not a word, so the same in every language. */
const SEPARATOR = '›';

/**
 * One crumb in the organizer header's trail, after a separator. The layout
 * shows the trail from `md` up, where it shares its row with Help, the
 * account and Sign out. When the row is full, only the current page's crumb
 * shortens with "…": it repeats the page's heading, while the crumbs before
 * it are links, so they keep their words (up to 8rem, for a long
 * translation) and stay big enough to click. The whole label stays in the
 * page for screen readers.
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
    <Link
      href={href}
      lang={lang}
      className="max-w-[8rem] shrink-0 truncate hover:text-ink hover:underline"
    >
      {children}
    </Link>
  ) : (
    <span lang={lang} className="truncate font-medium text-ink" aria-current="page">
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
