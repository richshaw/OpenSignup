import { expect, test, type Page } from '@playwright/test';
import { NOT_FOUND_PAGE } from '@/app/not-found-message';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';
import { createDisposableSession } from './helpers/seed';

const seed = loadSeed();

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The app has three root layouts and none above them (src/app/root-shell.tsx).
// Each must still give its pages the language, the icons and the manifest the
// single root layout used to, and an address no page matches must get the
// site's own 404 rather than Next's, which has no `lang`.

/** Every icon and the manifest the page links to answer 200. */
async function expectIconsAndManifest(page: Page) {
  const hrefs = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href));
  expect(hrefs.some((h) => h.includes('/icon.svg'))).toBe(true);
  expect(hrefs.some((h) => h.includes('/apple-icon.png'))).toBe(true);
  expect(hrefs.some((h) => h.includes('/manifest.webmanifest'))).toBe(true);
  for (const href of hrefs) {
    expect((await page.request.get(href)).status(), href).toBe(200);
  }
}

/**
 * The share image `rootMetadata` names. For a page that sets no `openGraph` or
 * `twitter` of its own it's the only one, so a link to the page would preview
 * with no picture without it.
 */
async function expectShareImage(page: Page) {
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/opengraph-image\.png$/,
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    'content',
    /\/twitter-image\.png$/,
  );
}

test.describe('root layouts', () => {
  test('the help pages are English, with the icons and manifest', async ({ page }) => {
    await page.goto('/help');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(/^Help · /);
    await expectIconsAndManifest(page);
  });

  test('the organizer app is English, with the icons and manifest', async ({ page, context }) => {
    await loginAsSeededOrganizer(context);
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1, name: 'Your signups' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(/^Your signups · /);
    await expectIconsAndManifest(page);
    await expectShareImage(page);
  });

  test('sign-in and an edit link, which name no share image, get the site’s', async ({ page }) => {
    for (const path of [
      '/login',
      `/s/${seed.editSlug}/c/${seed.editCommitmentId}?token=${seed.editToken}`,
    ]) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expectShareImage(page);
    }
  });

  test('a signup page is English, with the icons, the manifest and the footer', async ({
    page,
  }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    await expect(page.getByRole('heading', { level: 1, name: seed.publicTitle })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // The page shares its segment with its root layout, so it writes the site
    // name into its own title (src/app/s/[slug]/page.tsx).
    await expect(page).toHaveTitle(new RegExp(`^${escapeRegExp(seed.publicTitle)} · .+`));
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expectIconsAndManifest(page);
  });
});

test.describe('an address no page matches', () => {
  for (const path of ['/no-such-page', '/s', '/help/no-such-article', '/app/no-such-page']) {
    test(`${path} gets the site's 404, marked English`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page).toHaveTitle(new RegExp(`^${NOT_FOUND_PAGE.tabTitle} · `));
      await expect(
        page.getByRole('heading', { level: 1, name: NOT_FOUND_PAGE.title }),
      ).toBeVisible();
      await expect(page.getByText(NOT_FOUND_PAGE.body)).toBeVisible();
      await expect(page.getByRole('link', { name: NOT_FOUND_PAGE.action.label })).toHaveAttribute(
        'href',
        NOT_FOUND_PAGE.action.href,
      );
      await expect(page.getByRole('contentinfo')).toBeVisible();
      // Not Next's own page.
      await expect(page.getByText('This page could not be found')).toHaveCount(0);
      // Its `metadata` is its own, built on `rootMetadata`.
      await expectShareImage(page);
    });
  }
});

test.describe('signing out', () => {
  // Sign out is a server action on /app that redirects to the home page, in
  // another root layout, so the browser has to load the whole page.
  test('lands on the home page, and /app then asks to sign in', async ({ page, context }) => {
    // Sign-out deletes the session row, so this test brings its own.
    await loginAsSeededOrganizer(context, {
      sessionToken: await createDisposableSession(seed.organizerId),
    });
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1, name: 'Your signups' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();

    await page.waitForURL((url) => url.pathname === '/' && url.search === '');
    await expect(page.getByRole('heading', { level: 1, name: /Sign-up sheets,/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(errors).toEqual([]);

    await page.goto('/app');
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fapp$/);
  });
});
