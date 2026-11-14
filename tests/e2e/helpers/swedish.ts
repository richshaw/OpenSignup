import { expect, type Page } from '@playwright/test';

/**
 * Opens `path` on the seeded Swedish signup (`seed.swedish`) and checks its
 * page is in Swedish. Swedish hasn't shipped, so the server shows it only
 * with `E2E_UNSHIPPED_LOCALES=sv`: playwright.config.ts gives that to the
 * server it starts, but a server already running (a reused `pnpm dev`) needs
 * it too, and this says so rather than failing on English text.
 */
export async function gotoSwedish(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(
    page.locator('main'),
    'the Swedish signup is in English: start the server with E2E_UNSHIPPED_LOCALES=sv',
  ).toHaveAttribute('lang', 'sv');
}
