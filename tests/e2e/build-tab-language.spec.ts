import { expect, test, type Locator, type Page } from '@playwright/test';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { getTranslator } from '@/i18n/translator';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';
import { createOrganizerIn, type OrganizerIn } from './helpers/organizer-language';

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

/** The Build tab's own words in `locale`, from the catalog, as vitest formats them. */
function buildTabText(locale: CatalogLocale) {
  return getTranslator(locale, 'organizer.build', {
    onError: (error) => {
      throw error;
    },
  });
}

/** The language `locator`'s element is in: its own `lang`, or its nearest ancestor's. */
function languageOf(locator: Locator): Promise<string | null | undefined> {
  return locator.evaluate((element) => element.closest('[lang]')?.getAttribute('lang'));
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
      // The tab's own words are its organizer's, who stores no language.
      expect(await languageOf(page.getByRole('button', { name: /^Fields/ }))).toBe('en');
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

/**
 * An organizer who stores each language with a catalog but English, on a
 * signup of theirs in the instance's language: the tab's own words are the
 * organizer's, the signup's content its own, and the server's render and the
 * browser's agree on both. Where a catalog has no Build tab text yet, its
 * words show in English, as the check expects, and the `lang` marks still
 * say whose language they are. The organizer app shows an unshipped
 * language only with it in `E2E_UNSHIPPED_LOCALES`, as playwright.config.ts
 * starts the server.
 */
for (const locale of CATALOG_LOCALES.filter((l) => l !== 'en')) {
  test.describe(`an organizer who stores ${locale}, on a signup in English`, () => {
    let organizer: OrganizerIn;

    test.beforeAll(async () => {
      organizer = await createOrganizerIn(locale, `build-${test.info().project.name}`);
    });

    test.beforeEach(async ({ context }) => {
      await loginAsSeededOrganizer(context, { sessionToken: organizer.sessionToken });
    });

    test(`hydrates with no mismatch, its own words in ${locale}`, async ({ page }) => {
      const t = buildTabText(locale);
      const errors = watchForHydrationErrors(page);
      await openBuildTab(page, organizer.open.id);
      expect(errors).toEqual([]);

      // A new signup's two starting columns, What and Date.
      const fields = page.getByRole('button', { name: t('rail.fields', { count: 2 }) });
      await expect(fields).toBeVisible();
      expect(
        await languageOf(fields),
        `the organizer app isn’t in ${locale}: start the server with E2E_UNSHIPPED_LOCALES=${locale}`,
      ).toBe(locale);
      await expect(page.getByText(t('rail.editing'), { exact: true })).toBeVisible();
      const count = t('slot.takenOf', { taken: 0, capacity: 5 });
      const row = page.getByRole('button', {
        name: t('slot.row', { kind: 'named', name: 'Cookies', count }),
      });
      await expect(row).toBeVisible();
      await expect(row).toContainText('Cookies');

      await fields.click();
      const dialog = page.getByRole('dialog', { name: t('fields.label') });
      await expect(dialog).toHaveAttribute('lang', locale);
      await expect(dialog.getByRole('button', { name: t('fields.add') })).toBeVisible();
    });
  });
}
