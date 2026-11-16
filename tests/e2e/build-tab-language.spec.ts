import { expect, test, type Page } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();
const { groups } = seed.swedishBuild;

/**
 * What the browser reports while `page` is open that would mean its first
 * render didn't match the server's HTML. A production build reports a
 * hydration mismatch as an uncaught error ("Minified React error #418"), so
 * every uncaught error is collected, and any console error that names one.
 */
function watchForHydrationErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /hydrat|react error #4(18|19|21|22|23|25)/i.test(message.text())
    ) {
      errors.push(message.text());
    }
  });
  return errors;
}

/** The Build tab's group headings, top to bottom. */
async function groupHeadings(page: Page): Promise<string[]> {
  const labels = await page
    .getByRole('button', { name: /^Group header/ })
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''));
  return labels.map((label) => label.replace(/^Group header — /, ''));
}

/**
 * Opens a Build tab and waits until it works: the Fields dialog only opens
 * once React has hydrated the page, by when it has reported any mismatch.
 */
async function openBuildTab(page: Page, signupId: string): Promise<void> {
  await page.goto(`/app/signups/${signupId}/build`);
  await page.getByRole('button', { name: /^Fields/ }).click();
  await expect(page.getByRole('dialog', { name: /^Fields/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/**
 * A Swedish signup's Build tab. Its language reaches the tab's client
 * components as the order its groups sort in and the names a new field gets,
 * and both render on the server first, so the browser must agree with the
 * server whatever its own language: Node's ICU and the browser's could sort
 * or format differently. Swedish hasn't shipped, so the server shows these
 * signups in Swedish only with `E2E_UNSHIPPED_LOCALES=sv`, which
 * playwright.config.ts gives the server it starts.
 */
for (const browserLocale of ['en-US', 'sv-SE']) {
  test.describe(`a Swedish signup’s Build tab, in a browser set to ${browserLocale}`, () => {
    test.use({ locale: browserLocale });

    test.beforeEach(async ({ context }) => {
      await loginAsSeededOrganizer(context);
    });

    test('hydrates with no mismatch, and sorts its groups in Swedish', async ({ page }) => {
      const errors = watchForHydrationErrors(page);
      await openBuildTab(page, seed.swedishBuild.id);
      expect(
        await groupHeadings(page),
        'groups in English order: start the server with E2E_UNSHIPPED_LOCALES=sv',
      ).toEqual([...groups]);
      expect(errors).toEqual([]);
    });

    test('hydrates with no mismatch on a signup grouped by date', async ({ page }) => {
      const errors = watchForHydrationErrors(page);
      await openBuildTab(page, seed.swedish.id);
      await expect(page.getByRole('button', { name: /^Group header/ }).first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test.describe('a Swedish signup’s Build tab', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  test('names a new field left without a name, and its first option, in Swedish', async ({
    page,
  }) => {
    await openBuildTab(page, seed.swedishBuild.id);
    await page.getByRole('button', { name: /^Fields/ }).click();
    // Named by its title, which says New field once the form opens.
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Add field' }).click();
    await dialog.getByRole('button', { name: 'List', exact: true }).click();
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/signups/${seed.swedishBuild.id}/fields`) &&
        r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Add field', exact: true }).click();
    const field = (await (await saved).json()).data as {
      label: string;
      config: { choices: string[] };
    };
    expect(field.label).toBe('Namnlös');
    expect(field.config.choices).toEqual(['Alternativ 1']);
  });
});
