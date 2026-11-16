import Link from 'next/link';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import { shortCommit } from '@/lib/build-info';
import { FOOTER_LINKS } from '@/lib/footer-links';
import { INSTANCE_NAME, SOURCE_URL, SUPPORT_MAILTO } from '@/lib/site-config';

/**
 * The footer under the landing, help, legal, sign-in and public signup pages,
 * in `locale`. The caller says which language rather than the footer working
 * it out, because several of those pages are static and must not read the
 * environment (`getEnv()`) for the instance's default.
 */
export function SiteFooter({ locale }: { locale: CatalogLocale }) {
  const t = getServerTranslator(locale, 'common.footer');
  // The build's commit, or nothing when the build didn't know it.
  const commit = shortCommit();
  return (
    <footer className="flex flex-col items-center justify-between gap-3 border-t border-surface-sunk px-5 py-5 text-sm text-ink-soft lg:flex-row lg:gap-4 lg:px-12">
      <span>
        {commit ? `${commit} · ` : ''}
        {t('license', { instance: INSTANCE_NAME })}
      </span>
      <nav
        aria-label={t('label')}
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
      >
        {FOOTER_LINKS.map((link) => (
          <Link key={`${link.href} ${link.label}`} href={link.href} className="hover:underline">
            {link.label}
          </Link>
        ))}
        <Link href="/help" className="hover:underline">
          {t('help')}
        </Link>
        <Link href="/privacy" className="hover:underline">
          {t('privacy')}
        </Link>
        <Link href="/terms" className="hover:underline">
          {t('terms')}
        </Link>
        <Link href="/cookies" className="hover:underline">
          {t('cookies')}
        </Link>
        <a href={SOURCE_URL} className="hover:underline">
          {t('source')}
        </a>
        <a href={SUPPORT_MAILTO} className="hover:underline">
          {t('contact')}
        </a>
      </nav>
    </footer>
  );
}
