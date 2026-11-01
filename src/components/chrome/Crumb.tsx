import Link from 'next/link';

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
        ›
      </span>
      {label}
    </>
  );
}
