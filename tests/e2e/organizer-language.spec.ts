import { expect, test, type Locator } from '@playwright/test';
import { formatGrantDate } from '@/app/app/(chrome)/settings/connected-apps/grant-date';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { getTranslator, type Namespace } from '@/i18n/translator';
import { accessTokenLifetime } from '@/lib/lifetimes';
import { loginAsSeededOrganizer } from './helpers/auth';
import { connectAppFor, createOrganizerIn, type OrganizerIn } from './helpers/organizer-language';

/**
 * The organizer app follows the language stored on the organizer's account
 * (`getOrganizerAppLocale`): English with none stored, and each other
 * language with a catalog when stored. None has shipped to organizers yet,
 * so the server shows one only with it in `E2E_UNSHIPPED_LOCALES`, which
 * playwright.config.ts gives the server it starts.
 *
 * Text is held to the catalog in that language, formatted as vitest formats
 * it: where a catalog has no organizer text yet, the page shows English, as
 * the check expects, and the `lang` marks still say whose language it is.
 */

/** Each organizer's own data, so this file's tests run one after another. */
test.describe.configure({ mode: 'default' });

/** Nothing stored, then each language with a catalog besides English. */
const STORED: readonly (CatalogLocale | null)[] = [
  null,
  ...CATALOG_LOCALES.filter((locale) => locale !== 'en'),
];

function messagesIn<N extends Namespace>(locale: CatalogLocale, namespace: N) {
  return getTranslator(locale, namespace, {
    onError: (error) => {
      throw error;
    },
  });
}

/** The language `locator`'s element is in: its own `lang`, or its nearest ancestor's. */
function languageOf(locator: Locator): Promise<string | null | undefined> {
  return locator.evaluate((element) => element.closest('[lang]')?.getAttribute('lang'));
}

/** A rich message as the page shows it: its text, tags and all left as text. */
const plain = (chunks: string) => chunks;

/** A tab title that starts with `text`, then the site's name. */
const titled = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · `);

for (const stored of STORED) {
  const locale = stored ?? 'en';
  const unshippedHint = stored
    ? `the organizer app isn’t in ${stored}: start the server with E2E_UNSHIPPED_LOCALES=${stored}`
    : 'an organizer with no language stored gets English';

  test.describe(`an organizer who stores ${stored ?? 'no language'}`, () => {
    let organizer: OrganizerIn;

    test.beforeAll(async () => {
      organizer = await createOrganizerIn(stored, test.info().project.name);
    });

    test.beforeEach(async ({ context }) => {
      await loginAsSeededOrganizer(context, { sessionToken: organizer.sessionToken });
    });

    test(`sees the header, Your signups and the crumbs in ${locale}`, async ({ page }) => {
      const chrome = messagesIn(locale, 'organizer.chrome');
      const dashboard = messagesIn(locale, 'organizer.dashboard');
      const crumbs = messagesIn(locale, 'organizer.crumbs');

      await page.goto('/app');
      expect(await languageOf(page.getByRole('banner')), unshippedHint).toBe(locale);
      const trail = page.getByRole('navigation', { name: chrome('breadcrumb') });
      await expect(trail.getByRole('link', { name: chrome('home') })).toBeVisible();
      await expect(page.getByRole('button', { name: chrome('signOut') })).toBeVisible();
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(dashboard('title'));
      expect(await languageOf(heading)).toBe(locale);
      await expect(page).toHaveTitle(titled(dashboard('title')));
      await expect(page.getByText(dashboard('total', { count: 2 }))).toBeVisible();
      await expect(page.getByText(dashboard('draftOnlyYou'))).toBeVisible();

      await page.goto('/app/settings');
      const here = trail.locator('[aria-current="page"]');
      await expect(here).toHaveText(crumbs('settings'));
      expect(await languageOf(here)).toBe(locale);
      await page.goto('/app/settings/connected-apps');
      await expect(trail.getByRole('link', { name: crumbs('settings') })).toBeVisible();
      await expect(here).toHaveText(crumbs('connectedApps'));
      await page.goto('/app/signups/new');
      await expect(here).toHaveText(crumbs('newSignup'));
    });

    test(`sees account Settings and Connected apps in ${locale}`, async ({ page }) => {
      const settings = messagesIn(locale, 'organizer.settings');
      const apps = messagesIn(locale, 'organizer.connectedApps');
      const lifetime = accessTokenLifetime(locale);
      const heading = page.getByRole('heading', { level: 1 });

      await page.goto('/app/settings');
      await expect(heading).toHaveText(settings('title'));
      expect(await languageOf(heading), unshippedHint).toBe(locale);
      await expect(page).toHaveTitle(titled(settings('title')));
      await expect(
        page.getByText(settings.markup('signedInAs', { email: organizer.email, account: plain })),
      ).toBeVisible();
      const card = page.getByRole('link', { name: settings('connectedApps.title') });
      await expect(card).toContainText(settings('connectedApps.description'));

      // Over a client-side navigation, which re-renders the page but not the
      // layout, so the page works out the language itself.
      await card.click();
      await expect(page).toHaveURL(/\/app\/settings\/connected-apps$/);
      await expect(heading).toHaveText(apps('title'));
      expect(await languageOf(heading)).toBe(locale);
      await expect(page).toHaveTitle(titled(apps('title')));
      await expect(page.getByText(apps('intro'))).toBeVisible();
      await expect(page.getByText(apps('empty.title'))).toBeVisible();
      await expect(page.getByText(apps('empty.body'))).toBeVisible();
      await expect(page.getByText(apps('footnote', { lifetime }))).toBeVisible();

      const dates = await connectAppFor(organizer);
      await page.reload();
      const app = page.getByRole('listitem').filter({ hasText: 'assistant.example.com' });
      await expect(app).toContainText(
        apps('dates', {
          approved: formatGrantDate(dates.approvedAt, locale),
          used: 'yes',
          lastUsed: formatGrantDate(dates.lastUsedAt, locale),
          expiring: 'yes',
          expires: formatGrantDate(dates.expiresAt, locale),
        }),
      );
      await expect(app.getByRole('button', { name: apps('disconnect') })).toBeVisible();

      await page.goto('/app/settings/connected-apps?disconnected=1');
      await expect(page.getByRole('status')).toHaveText(apps('disconnected', { lifetime }));
    });

    test(`is told in ${locale} when a signup can’t be found`, async ({ page }) => {
      const loadError = messagesIn(locale, 'organizer.loadError');
      await page.goto('/app/signups/sig_doesnotexist/build');
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(loadError('notFound.title'));
      expect(await languageOf(heading)).toBe(locale);
      await expect(page).toHaveTitle(titled(loadError('tabTitle')));
      await expect(page.getByRole('link', { name: loadError('goToSignups') })).toBeVisible();
    });

    test(`sees the strip on their signup’s page in ${locale}`, async ({ page }) => {
      const strip = messagesIn(locale, 'organizer.publicPage.strip');
      await page.goto(`/s/${organizer.open.slug}`);
      const nav = page.getByRole('navigation', { name: strip('label') });
      await expect(nav, unshippedHint).toHaveAttribute('lang', locale);
      await expect(nav).toContainText(strip.markup('note', { b: plain }));
      await expect(nav.getByRole('link', { name: strip('responses') })).toBeVisible();
      await expect(nav.getByRole('link', { name: strip('edit') })).toBeVisible();
      // The page under it is the signup's, in the instance's language.
      await expect(page.locator('main')).toHaveAttribute('lang', 'en');
    });

    test(`is told about their own draft in ${locale}`, async ({ page }) => {
      const own = messagesIn(locale, 'organizer.publicPage.ownDraft');
      await page.goto(`/s/${organizer.draft.slug}`);
      await expect(page.locator('main'), unshippedHint).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(own('title'));
      await expect(page.getByRole('link', { name: own('open') })).toBeVisible();
    });

    test(`sees the Preview banner in ${locale}`, async ({ page }) => {
      const preview = messagesIn(locale, 'organizer.preview');
      await page.goto(`/app/signups/${organizer.open.id}/preview`);
      const banner = page.getByRole('status');
      await expect(banner).toContainText(preview('title'));
      await expect(banner).toContainText(preview('body', { status: 'open' }));
      expect(await languageOf(banner), unshippedHint).toBe(locale);
      // What participants will see stays in the signup's language.
      await expect(page.locator('main')).toHaveAttribute('lang', 'en');
    });
  });
}
