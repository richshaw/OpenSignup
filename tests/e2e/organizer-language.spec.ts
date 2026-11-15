import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type Locator } from '@playwright/test';
import { formatGrantDate } from '@/app/app/(chrome)/settings/connected-apps/grant-date';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { getTranslator, type Namespace } from '@/i18n/translator';
import { accessTokenLifetime } from '@/lib/lifetimes';
import { loginAsSeededOrganizer } from './helpers/auth';
import { BASE_URL } from './helpers/fixtures';
import {
  connectAppFor,
  createOrganizerIn,
  publishSignupIn,
  type OrganizerIn,
} from './helpers/organizer-language';

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

/** The one of a computer's and a phone's copies that's on screen. */
const onScreen = (locator: Locator) => locator.locator('visible=true');

/** A name that starts with `text`, as a tab's does, its count after it. */
const startsWith = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

/** A tab title that starts with `text`, then the site's name. */
const titled = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · `);

/**
 * An AI assistant's request to connect, from the `e2e-client` static client
 * (OAUTH_STATIC_CLIENTS, as in .env.example), asking for `scope`.
 */
function connectionRequest(scope: string): string {
  const verifier = randomBytes(32).toString('base64url');
  const q = new URLSearchParams({
    client_id: 'e2e-client',
    redirect_uri: `${BASE_URL}/e2e/oauth-callback`,
    response_type: 'code',
    scope,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource: `${BASE_URL}/api/mcp`,
    state: 'e2e',
  });
  return `/api/oauth/authorize?${q}`;
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
      const scopes = messagesIn(locale, 'auth.scopes');
      await expect(app.getByText(scopes('signupsRead'), { exact: true })).toBeVisible();
      await expect(app.getByText(scopes('signupsWrite'), { exact: true })).toBeVisible();

      await page.goto('/app/settings/connected-apps?disconnected=1');
      await expect(page.getByRole('status')).toHaveText(apps('disconnected', { lifetime }));
    });

    test(`is asked to connect an AI assistant in ${locale}`, async ({ page }) => {
      const consent = messagesIn(locale, 'auth.consent');
      const scopes = messagesIn(locale, 'auth.scopes');
      await page.goto(connectionRequest('signups:read signups:write commitments:read'));
      test.skip(
        (await page.content()).includes('invalid_client'),
        'OAUTH_STATIC_CLIENTS has no "e2e-client": set it as in .env.example',
      );
      await expect(page).toHaveURL(/\/oauth\/consent\//);
      const permissions = page.getByRole('heading', { level: 2 });
      await expect(permissions).toHaveText(consent('permissions'));
      expect(await languageOf(permissions), unshippedHint).toBe(locale);
      await expect(page).toHaveTitle(titled(consent('tabTitle')));
      await expect(page.getByText(consent('request'))).toBeVisible();
      await expect(
        page.getByText(consent.markup('setUpBySite', { name: 'E2E test client', strong: plain })),
      ).toBeVisible();
      for (const key of ['signupsRead', 'signupsWrite', 'commitmentsRead'] as const) {
        await expect(page.getByText(scopes(key), { exact: true })).toBeVisible();
      }
      // The warning on participants' details, still in its warning colour.
      await expect(page.getByText(scopes('commitmentsRead'), { exact: true })).toHaveClass(
        /text-warn/,
      );
      await expect(page.getByText(consent('sensitive', { domain: 'e2e-client' }))).toBeVisible();
      await expect(
        page.getByText(
          consent.markup('actsAs', { workspaces: 'one', email: organizer.email, strong: plain }),
        ),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: consent('allow'), exact: true })).toBeVisible();
      await expect(page.getByText(consent.markup('disconnect', { link: plain }))).toBeVisible();
      await expect(page.locator('a[href="/app/settings/connected-apps"]')).toBeVisible();
      await expect(page.getByRole('button', { name: consent('switchAccount') })).toBeVisible();

      // Saying no hands the request back, so it leaves nothing behind.
      await page.getByRole('button', { name: consent('deny') }).click();
      await page.waitForURL(/\/e2e\/oauth-callback\?/);
      expect(new URL(page.url()).searchParams.get('error')).toBe('access_denied');
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

    test(`sees a draft’s header, tabs and Publish’s check in ${locale}`, async ({ page }) => {
      const signup = messagesIn(locale, 'organizer.signup');
      const status = messagesIn(locale, 'organizer.status');
      await page.goto(`/app/signups/${organizer.draft.id}/build`);
      const title = page.getByRole('heading', { level: 1 }).locator('visible=true');
      await expect(title).toHaveText('Draft Picnic');
      expect(await languageOf(title), unshippedHint).toBe(locale);
      await expect(onScreen(page.getByText(status('draft'), { exact: true }))).toBeVisible();
      await expect(onScreen(page.getByText(signup('draftLine')))).toBeVisible();
      const tabs = page.getByRole('tablist', { name: signup('tabs.label') });
      for (const tab of ['build', 'responses', 'settings'] as const) {
        await expect(
          tabs.getByRole('tab', { name: startsWith(signup(`tabs.${tab}`)) }),
        ).toBeVisible();
      }

      // Its one slot, the one a new signup starts with, is empty, so Publish's
      // check stops it, and publishes nothing.
      await onScreen(page.getByRole('button', { name: signup('publish.label') })).click();
      const check = page.getByRole('dialog', { name: signup('check.title') });
      await expect(check).toContainText(signup('check.allBlank', { count: 1 }));
      await expect(check.getByRole('button', { name: signup('check.fillIn') })).toBeVisible();
      await check.getByRole('button', { name: signup('check.notNow') }).click();
      await expect(check).toBeHidden();
      await expect(onScreen(page.getByText(status('draft'), { exact: true }))).toBeVisible();
    });

    test(`shares a signup in its own language from a panel in ${locale}`, async ({ page }) => {
      // The first language with a catalog that isn't the organizer's.
      const signupLocale = CATALOG_LOCALES.find((other) => other !== locale) ?? 'en';
      const elsewhere = await publishSignupIn(organizer, signupLocale);
      const share = messagesIn(locale, 'organizer.share');
      const message = messagesIn(signupLocale, 'participant.share');
      const phone = (page.viewportSize()?.width ?? 1280) < 768;
      await page.goto(`/app/signups/${elsewhere.id}/build`);

      // The public link's chip, by the title on a computer, under it on a phone.
      await expect(onScreen(page.getByText(share('chip.label'), { exact: true }))).toBeVisible();
      await expect(onScreen(page.getByRole('button', { name: share('chip.copy') }))).toBeVisible();
      const open = onScreen(page.getByRole('link', { name: share('chip.open') }));
      const url = await open.getAttribute('href');
      expect(url).toMatch(new RegExp(`/s/${elsewhere.slug}$`));

      await onScreen(page.getByRole('button', { name: share('button') })).click();
      const panel = page.getByRole('dialog', { name: share('heading.later') });
      await expect(panel).toBeVisible();
      // A phone's sheet sits outside the page's wrapper, under <html lang> (#938).
      if (!phone) expect(await languageOf(panel), unshippedHint).toBe(locale);
      await expect(panel.getByText(share(phone ? 'lead.phone' : 'lead.desktop'))).toBeVisible();
      await expect(panel.getByRole('button', { name: share('copyLink') })).toBeVisible();
      await expect(
        panel.getByRole(phone ? 'button' : 'link', {
          name: share(phone ? 'qr.show' : 'qr.downloadLabel'),
        }),
      ).toBeVisible();
      // The message is for participants: in the signup's language, whatever
      // the organizer's. A new signup's empty slot holds 1, and Blankets 4.
      await expect(panel.getByLabel(share('messageLabel'))).toHaveValue(
        [
          elsewhere.title,
          message('spotsOpen', { count: 5 }),
          message('signUp', { url: url! }),
        ].join('\n'),
      );
      if (!phone) {
        await expect(panel.getByRole('button', { name: share('copyMessage') })).toBeVisible();
        await expect(panel.getByRole('link', { name: share('emailIt') })).toBeVisible();
      }
      await panel.getByRole('button', { name: share('close') }).click();
      await expect(panel).toBeHidden();
    });

    // Last, since it closes the open signup the tests above read, and reopens it.
    test(`closes and reopens a signup in ${locale}`, async ({ page }) => {
      const signup = messagesIn(locale, 'organizer.signup');
      const status = messagesIn(locale, 'organizer.status');
      const phone = (page.viewportSize()?.width ?? 1280) < 768;
      const more = onScreen(page.getByRole('button', { name: signup('moreActions') }));
      await page.goto(`/app/signups/${organizer.open.id}/build`);
      await expect(onScreen(page.getByText(status('open'), { exact: true }))).toBeVisible();
      // The slot a new signup starts with holds 1, and Cookies 5.
      const spots = signup('spots.takenOf', { taken: 0, total: 6 });
      await expect(
        onScreen(page.getByText(signup('spots.line', { status: 'open', spots }))),
      ).toBeVisible();

      await more.click();
      await onScreen(page.getByRole('button', { name: signup('close.action') })).click();
      const question = signup('close.question', {
        standing: signup('close.standing.nobody'),
        kept: 'no',
      });
      const asked = page.getByRole('group', { name: question });
      await expect(asked).toBeVisible();
      await expect(asked.getByRole('button', { name: signup('close.notYet') })).toBeVisible();
      await asked.getByRole('button', { name: signup('close.action') }).click();

      await expect(onScreen(page.getByText(status('closed'), { exact: true }))).toBeVisible();
      await expect(page.getByText(signup('closed.title'))).toBeVisible();
      await expect(page.getByText(signup('closed.body'))).toBeVisible();
      await expect(page.getByRole('button', { name: signup('closed.dismiss') })).toBeVisible();
      await expect(
        onScreen(page.getByText(signup('spots.line', { status: 'closed', spots }))),
      ).toBeVisible();

      // Beside Preview on a computer; in the More actions sheet on a phone.
      if (phone) await more.click();
      await onScreen(page.getByRole('button', { name: signup('reopen.action') })).click();
      await expect(onScreen(page.getByText(status('open'), { exact: true }))).toBeVisible();
      await expect(page.getByText(signup('closed.title'))).toBeHidden();
    });
  });
}
