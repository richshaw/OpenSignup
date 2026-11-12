import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

const BUTTON =
  'inline-flex h-11 items-center gap-1 rounded-lg border border-surface-sunk bg-white px-3 text-sm font-medium text-ink md:h-9';

/**
 * The footer of the dashboard's list once a workspace has more signups than
 * one page holds: which ones are showing, and Newer / Older.
 * Both buttons always show, so they don't jump about; the one that has
 * nowhere to go is dimmed and inert. Plain links, so it adds no client
 * JavaScript.
 */
export function DashboardPager({
  range,
  newerHref,
  olderHref,
}: {
  range: string;
  newerHref: string | null;
  olderHref: string | null;
}) {
  return (
    <nav
      aria-label="Signup pages"
      className="flex items-center justify-between gap-3 border-t border-surface-sunk bg-surface-raised px-4 py-2.5 sm:px-5"
    >
      <p className="text-sm tabular-nums text-ink-muted">{range}</p>
      <div className="flex items-center gap-2">
        <PagerButton href={newerHref}>
          <ChevronLeft size={16} aria-hidden="true" />
          Newer
        </PagerButton>
        <PagerButton href={olderHref}>
          Older
          <ChevronRight size={16} aria-hidden="true" />
        </PagerButton>
      </div>
    </nav>
  );
}

function PagerButton({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) {
    // A link with nowhere to go: no href, so it can't be followed or focused,
    // and announced as a disabled link.
    return (
      <a role="link" aria-disabled="true" className={`${BUTTON} cursor-not-allowed opacity-50`}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={`${BUTTON} transition hover:bg-surface-sunk/40`}>
      {children}
    </Link>
  );
}
