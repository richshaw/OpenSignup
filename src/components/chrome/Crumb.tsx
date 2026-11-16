import Link from 'next/link';

/** What goes between two crumbs: a mark, not a word, so the same in every language. */
const SEPARATOR = '›';

export function Crumb({
  href,
  children,
  truncate = false,
  lang,
}: {
  href?: string;
  children: React.ReactNode;
  truncate?: boolean;
  /** The crumb's language, where it isn't the trail's: a signup's title is in the signup's. */
  lang?: string | undefined;
}) {
  const label = href ? (
    <Link
      href={href}
      lang={lang}
      className={`hover:text-ink hover:underline ${truncate ? 'truncate' : ''}`}
    >
      {children}
    </Link>
  ) : (
    <span
      lang={lang}
      className={`font-medium text-ink ${truncate ? 'truncate' : ''}`}
      aria-current="page"
    >
      {children}
    </span>
  );
  return (
    <>
      <span className="text-ink-soft" aria-hidden="true">
        {SEPARATOR}
      </span>
      {label}
    </>
  );
}
