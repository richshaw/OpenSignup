import { expect, test, type Locator, type Page } from '@playwright/test';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { getTranslator, type Namespace } from '@/i18n/translator';
import { loginAsSeededOrganizer } from './helpers/auth';
import { createOrganizerIn, type OrganizerIn } from './helpers/organizer-language';

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

/** `text` as a regular expression that matches only itself. */
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A tab title that starts with `text`, then the site's name. */
const titled = (text: string) => new RegExp(`^${escaped(text)} · `);

/**
 * What the browser reports while `page` is open that would mean its first
 * render didn't match the server's HTML: a production build reports a
 * hydration mismatch as an uncaught error ("Minified React error #418").
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

    test(`sees a signup’s Settings tab, its notices and the delete flow in ${locale}`, async ({
      page,
    }) => {
      const settings = messagesIn(locale, 'organizer.signupSettings');
      const saveNotice = messagesIn(locale, 'organizer.saveNotice');
      const errors = messagesIn(locale, 'organizer.errors');
      const tab = `/app/signups/${organizer.open.id}/settings`;

      await page.goto(tab);
      const form = page.getByRole('region', { name: settings('signupForm.title') });
      await expect(form).toBeVisible();
      expect(await languageOf(form), unshippedHint).toBe(locale);
      const ask = form.getByRole('group', { name: settings('signupForm.askForEmail') });
      await expect(ask.getByRole('radio', { name: settings('signupForm.required') })).toBeChecked();
      await expect(ask.getByRole('radio', { name: settings('signupForm.optional') })).toBeVisible();
      await expect(form.getByText(settings('signupForm.requiredHelp'))).toBeVisible();
      // Saving changes nothing here (Required stays Required), but says Saved.
      await form.getByRole('button', { name: settings('save') }).click();
      await expect(form.getByRole('status')).toHaveText(saveNotice('saved'));

      const danger = page.getByRole('region', { name: settings('dangerZone.title') });
      await expect(danger.getByText(settings('dangerZone.body'))).toBeVisible();
      await danger.getByRole('button', { name: settings('delete.start') }).click();
      const confirm = danger.getByRole('alertdialog', { name: settings('delete.label') });
      await expect(confirm.getByText(settings('delete.question'))).toBeVisible();
      await expect(confirm.getByRole('button', { name: settings('delete.confirm') })).toBeVisible();
      await confirm.getByRole('button', { name: settings('delete.cancel') }).click();
      await expect(danger.getByRole('button', { name: settings('delete.start') })).toBeVisible();

      // A refused save or delete comes back as its code.
      await page.goto(`${tab}?error=forbidden`);
      const refusal = page.getByRole('main').getByRole('alert');
      await expect(refusal).toHaveText(errors('code.forbidden'));
      expect(await languageOf(refusal)).toBe(locale);
    });

    test(`sees the Responses tab, the remove flow and the CSV’s own words in ${locale}`, async ({
      page,
    }) => {
      const responses = messagesIn(locale, 'organizer.responses');
      // Someone signs up, from an address of their own (RFC 5737), so the
      // per-IP limit every other spec's sign-ups share doesn't count it. A
      // name of its own, so a retry finds its own row.
      const who = `Robin ${Date.now()}`;
      const committed = await page.request.post(`/api/slots/${organizer.open.slotId}/commitments`, {
        headers: { 'x-forwarded-for': '203.0.113.82' },
        data: { name: who, email: `robin+${Date.now()}@example.test`, quantity: 1 },
      });
      expect(committed.ok()).toBe(true);

      await page.goto(`/app/signups/${organizer.open.id}/responses`);
      const table = page.getByRole('table');
      expect(await languageOf(table), unshippedHint).toBe(locale);
      for (const heading of ['name', 'email', 'slot', 'status', 'actions'] as const) {
        await expect(
          table.getByRole('columnheader', { name: responses(`table.${heading}`), exact: true }),
        ).toBeAttached();
      }
      await expect(page.getByRole('link', { name: responses('downloadCsv') })).toBeVisible();
      const row = table.getByRole('row').filter({ hasText: who });
      await expect(
        row.getByRole('cell', { name: responses('status.confirmed'), exact: true }),
      ).toBeVisible();

      // Remove, its question, Keep, then Yes.
      const label = responses('remove.label', { name: who, slot: 'Cookies' });
      const remove = row.getByRole('button', { name: label, exact: true });
      await expect(remove).toHaveText(responses('remove.button'));
      await remove.click();
      const confirm = page.getByRole('alertdialog', { name: responses('remove.dialogLabel') });
      await expect(confirm).toHaveAccessibleDescription(
        responses('remove.question', { label, count: 1 }),
      );
      await confirm.getByRole('button', { name: responses('remove.keep') }).click();
      await expect(confirm).toHaveCount(0);
      await remove.click();
      await confirm.getByRole('button', { name: responses('remove.confirm') }).click();
      await expect(
        row.getByRole('cell', { name: responses('status.removed'), exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(
          `${responses('summary.signUps', { count: 0 })} · ${responses('summary.removed', { count: 1 })}`,
        ),
      ).toBeVisible();

      // The CSV's column names and statuses come in the organizer's language,
      // whatever the browser asks for. The signup's own column names stay.
      const csv = await page.request.get(`/api/signups/${organizer.open.id}/export.csv`, {
        headers: { 'accept-language': locale === 'en' ? 'sv' : 'en' },
      });
      expect(csv.ok()).toBe(true);
      const lines = (await csv.text()).replace(/^\uFEFF/, '').split('\n');
      expect(lines[0]?.split(',')).toEqual([
        'What',
        'Date',
        responses('csv.name'),
        responses('csv.email'),
        responses('csv.status'),
        responses('csv.spots'),
        responses('csv.notes'),
        responses('csv.signedUp'),
      ]);
      const robin = lines.find((line) => line.includes(who));
      expect(robin?.split(',')[0]).toBe('Cookies');
      expect(robin?.split(',')[4]).toBe(responses('status.removed'));
    });

    test(`starts a new signup in ${locale}`, async ({ page }) => {
      const newSignup = messagesIn(locale, 'organizer.newSignup');
      const compose = messagesIn(locale, 'organizer.compose');
      const hydration = watchForHydrationErrors(page);

      // Magic Compose, where the instance has an AI set up (LLM_BASE_URL).
      await page.goto('/app/signups/new');
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(
        new RegExp(`^(${escaped(compose('heading'))}|${escaped(newSignup('title'))})$`),
      );
      expect(await languageOf(heading), unshippedHint).toBe(locale);
      await expect(page).toHaveTitle(titled(newSignup('title')));
      if ((await heading.textContent()) === compose('heading')) {
        const box = page.getByRole('textbox', { name: compose('describe') });
        // An example is a description in the organizer's language, sent as is.
        await page
          .getByRole('button', {
            name: new RegExp(`^${escaped(compose('starters.sports.label'))}`),
          })
          .click();
        await expect(box).toHaveValue(compose('starters.sports.body'));
        await expect(page.getByText(compose('loaded'))).toBeVisible();
        // The hour's AI drafts used up, as the route answers it.
        await page.route('**/api/signups/magic-compose', (route) =>
          route.fulfill({
            status: 429,
            json: {
              error: {
                code: 'rate_limited',
                message: 'too many requests',
                details: { retryAfterSeconds: 700, bucket: 'magic.compose' },
              },
            },
          }),
        );
        await page.getByRole('button', { name: compose('draft') }).click();
        const alert = page.getByRole('main').getByRole('alert');
        await expect(alert).toHaveText(
          compose.markup('errors.hourlyLimit', { minutes: 12, link: plain }),
        );
        expect(await languageOf(alert)).toBe(locale);
        await expect(box).toHaveValue(compose('starters.sports.body'));
        await page.getByRole('link', { name: compose('skip') }).click();
      } else {
        await page.goto('/app/signups/new?manual=1');
      }

      // The form, from Skip or with no AI.
      await expect(page).toHaveURL(/\/app\/signups\/new\?manual=1$/);
      await expect(heading).toHaveText(newSignup('title'));
      expect(await languageOf(heading), unshippedHint).toBe(locale);
      await expect(page.getByText(newSignup('intro'))).toBeVisible();
      await expect(page.getByLabel(newSignup('titleLabel'))).toHaveAttribute(
        'placeholder',
        newSignup('titlePlaceholder'),
      );
      await expect(page.getByLabel(newSignup('descriptionLabel'))).toHaveAttribute(
        'placeholder',
        newSignup('descriptionPlaceholder'),
      );
      await expect(page.getByRole('link', { name: newSignup('cancel') })).toBeVisible();
      await expect(page.getByRole('button', { name: newSignup('create') })).toBeVisible();
      expect(hydration).toEqual([]);
    });
  });
}
