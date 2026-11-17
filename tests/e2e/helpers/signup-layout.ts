import { expect, type Page } from '@playwright/test';
import { type CatalogLocale, openGraphLocale } from '@/i18n/config';
import { getTranslator } from '@/i18n/translator';

/**
 * Checks what the layout around a signup's pages (src/app/s/[slug]/layout.tsx)
 * gives the page open in `page`, in `locale`: `<html lang>`, for screen readers
 * and the browser's offer to translate, og:locale, for link previews, and the
 * footer's words, from the catalog.
 */
export async function expectSignupLayoutIn(page: Page, locale: CatalogLocale): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
    'content',
    openGraphLocale(locale),
  );
  const t = getTranslator(locale, 'common.footer', {
    onError: (error) => {
      throw error;
    },
  });
  // Each of the footer's own links, wherever an instance's own links (ahead
  // of them) leave them.
  const footer = page.getByRole('contentinfo').getByRole('navigation', { name: t('label') });
  for (const key of ['help', 'privacy', 'terms', 'cookies', 'source', 'contact'] as const) {
    await expect(footer.getByRole('link', { name: t(key), exact: true })).toBeVisible();
  }
}
