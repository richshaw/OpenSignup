import Link from 'next/link';
import { INSTANCE_NAME, SOURCE_URL, SUPPORT_EMAIL } from '@/lib/site-config';

export function SiteFooter() {
  const version = process.env.npm_package_version ?? '0.1.0';
  return (
    <footer className="text-ink-soft border-surface-sunk flex flex-col items-center justify-between gap-3 border-t px-5 py-5 text-sm lg:flex-row lg:gap-4 lg:px-12">
      <span>
        v{version} · {INSTANCE_NAME} · AGPL-3.0
      </span>
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
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
        <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:underline">
          Contact
        </a>
      </nav>
    </footer>
  );
}
