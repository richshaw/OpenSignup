import { expect, type BrowserContext, type Page } from '@playwright/test';
import { COMMIT_COOKIE_NAME, serializeReturningCommits } from '@/lib/returning-participant';
import { BASE_URL } from './fixtures';
import type { Remembered } from './seed';

/**
 * Opens `path` on a seeded Swedish signup (`seed.swedish` and the others) and
 * checks its page is in Swedish. Swedish hasn't shipped, so the server shows
 * it only with `E2E_UNSHIPPED_LOCALES=sv`: playwright.config.ts gives that to
 * the server it starts, but a server already running (a reused `pnpm dev`)
 * needs it too, and this says so rather than failing on English text.
 */
export async function gotoSwedish(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(
    page.locator('main'),
    'the Swedish signup is in English: start the server with E2E_UNSHIPPED_LOCALES=sv',
  ).toHaveAttribute('lang', 'sv');
}

/**
 * Makes the browser remember a seeded sign-up as the one that made it would,
 * in the returning-participant cookie, so the signup's page shows its person
 * their own spot. Nothing on the server changes.
 */
export async function remember(context: BrowserContext, signUp: Remembered): Promise<void> {
  const { signupId, commitmentId, token } = signUp;
  await context.addCookies([
    {
      name: COMMIT_COOKIE_NAME,
      value: serializeReturningCommits([{ commitmentId, token, signupId }]),
      url: BASE_URL,
    },
  ]);
}
