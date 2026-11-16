import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import type { CatalogLocale } from '@/i18n/config';

/**
 * The frame around the sign-in and connection pages: one narrow column,
 * centred on a full-height page, with the site footer under it. The footer
 * also gives each page its Privacy and Terms links, which a page that
 * collects or shows an email address should have.
 *
 * `gap` and `padding` are the spacing each page already had; they stay
 * separate props so moving a page onto the frame doesn't change its look.
 * `locale` is the page's language: the frame marks the page with it for
 * screen readers, and the footer is in it. A page that doesn't give one is
 * English, as the root layout says.
 */
export function CenteredPageFrame({
  children,
  gap = 'gap-6',
  padding = 'py-16',
  header = false,
  locale,
}: {
  children: React.ReactNode;
  gap?: 'gap-6' | 'gap-8';
  padding?: 'py-8' | 'py-16';
  /** Show the site name above the column. */
  header?: boolean;
  locale?: CatalogLocale;
}) {
  return (
    <div lang={locale} className="flex min-h-[100svh] flex-col">
      {header ? <SiteHeader /> : null}
      <main className={`container-tight flex flex-1 flex-col justify-center ${gap} ${padding}`}>
        {children}
      </main>
      <SiteFooter locale={locale ?? 'en'} />
    </div>
  );
}
