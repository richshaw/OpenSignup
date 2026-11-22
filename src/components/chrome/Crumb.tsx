import Link from 'next/link';

/** What goes between two crumbs: a mark, not a word, so the same in every language. */
const SEPARATOR = '›';

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
    <Link href={href} lang={lang} className="truncate hover:text-ink hover:underline">
      {children}
    </Link>
  ) : (
    <span lang={lang} className="truncate font-medium text-ink" aria-current="page">
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
