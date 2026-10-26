import Link from 'next/link';
import { shortCommit } from '@/lib/build-info';
import { FOOTER_LINKS } from '@/lib/footer-links';
import { INSTANCE_NAME, SOURCE_URL, SUPPORT_MAILTO } from '@/lib/site-config';

export function SiteFooter() {
  // The build's commit, or nothing when the build didn't know it.
  const commit = shortCommit();
  return (
    <footer className="text-ink-soft border-surface-sunk flex flex-col items-center justify-between gap-3 border-t px-5 py-5 text-sm lg:flex-row lg:gap-4 lg:px-12">
      <span>
        {commit ? `${commit} · ` : ''}
        {INSTANCE_NAME} · AGPL-3.0
      </span>
      <nav
        aria-label="Footer"
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
      >
        {FOOTER_LINKS.map((link) => (
          <Link key={`${link.href} ${link.label}`} href={link.href} className="hover:underline">
            {link.label}
          </Link>
        ))}
        <Link href="/help" className="hover:underline">
          Help
        </Link>
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
