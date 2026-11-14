import { expect, test } from '@playwright/test';
import { loadSeed } from './helpers/fixtures';

/**
 * Messages with arguments, formatted the way production formats them.
 *
 * In the Next build, next-intl's loader compiles the message catalogs and the
 * web process formats them with use-intl's precompiled formatter
 * (`precompile` in next.config.mjs). Vitest and the reminder worker read the
 * raw JSON and use the full formatter, so only a real build shows what pages
 * print. The footer's `{instance} · AGPL-3.0` is checked on every kind of
 * page, a slot row's count on the public signup page, and the text client
 * components read in the browser. Broken, a message prints its key path, like
 * `common.footer.license` (a compiled message mangled on its way to the
 * translator), or its own text, like `{instance} · AGPL-3.0` (a message that
 * skipped the loader, which this formatter leaves unfilled).
 *
 * Run against a production build (`pnpm build`, then the config's
 * `pnpm start`). `pnpm dev` precompiles as well, so it passes there too.
 */
const seed = loadSeed();

const PAGES = [
  { name: 'a page the build prerenders', path: '/help' },
  { name: 'a page rendered for each request', path: '/login' },
  { name: 'the public signup page', path: `/s/${seed.publicSlug}` },
];

test.describe('a translated message with an argument', () => {
  for (const { name, path } of PAGES) {
    test(`shows the instance name in the footer of ${name}`, async ({ page }) => {
      await page.goto(path);
      // The build's NEXT_PUBLIC_INSTANCE_NAME, which the root layout also puts here.
      const instance = await page.locator('meta[name="application-name"]').getAttribute('content');
      expect(instance, 'no application-name meta tag').toBeTruthy();

      const line = await page.locator('footer > span').first().textContent();
      // After the build's short commit, when the build knew it.
      expect(line?.replace(/^[0-9a-f]{7} · /, '')).toBe(`${instance} · AGPL-3.0`);
    });
  }
});

test.describe('a participant message with arguments', () => {
  test('counts a slot’s spots on the public signup page', async ({ page }) => {
    await page.goto(`/s/${seed.optionalEmailSlug}`);
    // Twenty spots, so other specs signing up never fill it.
    const row = page.locator('li').filter({ hasText: seed.optionalEmailSlotLabel });
    await expect(row.locator('[aria-hidden="true"]').filter({ hasText: /left/ })).toHaveText(
      /^\d+ left$/,
    );
    await expect(row.locator('.sr-only').filter({ hasText: /left/ })).toHaveText(
      /^\d+ of 20 spots left$/,
    );
  });
});

/**
 * The sign-up sheet and the edit page's form read their text with
 * `useTranslations`, from the messages their page gives `ClientMessages`.
 * Broken, the name box reads `participant.fields.name`, or the page fails
 * with no messages provider at all.
 */
test.describe('a message a client component reads', () => {
  test('names the box on the sign-up sheet, which opens in the browser', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    const row = page.locator('li').filter({ hasText: seed.openSlotLabel });
    await row.getByRole('button', { name: 'Sign up' }).click();
    await expect(
      page.getByRole('dialog').getByRole('textbox', { name: 'Your name' }),
    ).toBeVisible();
  });

  test('names the box on the edit page, rendered on the server and then in the browser', async ({
    page,
  }) => {
    await page.goto(`/s/${seed.editSlug}/c/${seed.editCommitmentId}?token=${seed.editToken}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('textbox', { name: 'Your name' })).toBeVisible();
  });
});
