import Link from 'next/link';
import { INSTANCE_NAME, SOURCE_URL, SUPPORT_MAILTO } from '@/lib/site-config';

export function SiteFooter() {
  // Falls back to '0.0.0' if `next build` ran without npm_package_version set;
  // mirror that here in case the env var was inlined as the empty string.
  const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION;
  const version = rawVersion && rawVersion !== 'undefined' ? rawVersion : '0.0.0';
  return (
    <footer className="text-ink-soft border-surface-sunk flex flex-col items-center justify-between gap-3 border-t px-5 py-5 text-sm lg:flex-row lg:gap-4 lg:px-12">
      <span>
        v{version} · {INSTANCE_NAME} · AGPL-3.0
      </span>
      <nav
        aria-label="Footer"
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
      >
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
        <Link href="/cookies" className="hover:underline">
          Cookies
        </Link>
        <a href={SOURCE_URL} className="hover:underline">
          Source
        </a>
        <a href={SUPPORT_MAILTO} className="hover:underline">
          Contact
        </a>
      </nav>
    </footer>
  );
}
