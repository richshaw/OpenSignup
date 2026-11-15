import Link from 'next/link';

/** What goes between two crumbs: a mark, not a word, so the same in every language. */
const SEPARATOR = '›';

export function Crumb({
  href,
  children,
  truncate = false,
}: {
  href?: string;
  children: React.ReactNode;
  truncate?: boolean;
}) {
  const label = href ? (
    <Link href={href} className={`hover:text-ink hover:underline ${truncate ? 'truncate' : ''}`}>
      {children}
    </Link>
  ) : (
    <span className={`font-medium text-ink ${truncate ? 'truncate' : ''}`} aria-current="page">
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
