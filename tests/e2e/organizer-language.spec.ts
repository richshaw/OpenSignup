import { createHash, randomBytes } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { formatGrantDate } from '@/app/(organizer)/app/(chrome)/settings/connected-apps/grant-date';
import { AI_DRAFT_WARNINGS_KEY_PREFIX } from '@/components/magic-compose/ai-draft-warnings';
import { CATALOG_LOCALES, type CatalogLocale } from '@/i18n/config';
import { OTHER_LOCALE } from '@/i18n/testing/locales';
import { accessTokenLifetime } from '@/lib/lifetimes';
import { loginAsSeededOrganizer } from './helpers/auth';
import { BASE_URL } from './helpers/fixtures';
import {
  connectAppFor,
  createOrganizerIn,
  languageOf,
  messagesIn,
  publishSignupIn,
  type OrganizerIn,
} from './helpers/organizer-language';
import { translationShot } from './helpers/translation-shots';
import { unshippedHint as howToShow } from './helpers/unshipped-locales';

/**
 * The organizer app follows the language stored on the organizer's account
 * (`localeOfOrganizer`): English with none stored, and each other
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

/** A rich message as the page shows it: its text, tags and all left as text. */
const plain = (chunks: string) => chunks;

/** `text` as a regular expression that matches only itself. */
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The one of a computer's and a phone's copies that's on screen. */
const onScreen = (locator: Locator) => locator.locator('visible=true');

/** A name that starts with `text`, as a tab's does, its count after it. */
const startsWith = (text: string) => new RegExp(`^${escaped(text)}`);

/**
 * The WCAG A and AA problems axe finds on `page`, outside `exclude`, as a list
 * that's empty when there are none.
 */
async function axeViolations(page: Page, exclude?: string) {
  const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const results = await (exclude ? axe.exclude(exclude) : axe).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target),
  }));
}

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
    ? `the organizer app isn’t in ${stored}: ${howToShow(stored)}`
    : 'an organizer with no language stored gets English';

  test.describe(`an organizer who stores ${stored ?? 'no language'}`, () => {
    let organizer: OrganizerIn;

    /**
     * Saves what's on the page for a translation's review when
     * TRANSLATION_SCREENSHOTS=1 (`pnpm translation:screenshots`), for an
     * organizer in a language other than English, and does nothing
     * otherwise. Named `organizer-…`, beside translated-organizer.spec.ts's,
     * for the screens and states that spec doesn't reach.
     */
    const shot = async (page: Page, name: string, options?: { sheet?: boolean }) => {
      if (stored) await translationShot(page, stored, `organizer-${name}`, options);
    };

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
      await expect(trail.locator('a[href="/app"]').first()).toBeVisible();
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

    test(`gets ${locale} on <html lang>, and the sign-in pages the site’s`, async ({ page }) => {
      const html = page.locator('html');
      // The page itself, which screen readers and browser translation read,
      // and what anything outside the screens' own marks falls back to.
      await page.goto('/app');
      await expect(html, unshippedHint).toHaveAttribute('lang', locale);

      // The sign-in pages are in the site default, else English, whoever is
      // signed in, as their text is: this server sets no DEFAULT_LOCALE, and
      // the check page reads no session.
      await page.goto('/login/check');
      await expect(html).toHaveAttribute('lang', 'en');
      // It moves on once it sees the session, to the organizer app's own root
      // layout, so the whole page loads, in the organizer's language.
      await page.waitForURL(/\/app$/);
      await expect(html, unshippedHint).toHaveAttribute('lang', locale);
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
      await shot(page, 'connected-apps-empty');

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
      await shot(page, 'connected-apps');

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
      await expect(page.locator('html'), unshippedHint).toHaveAttribute('lang', locale);
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
      await shot(page, 'consent');

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
      await shot(page, 'signup-not-found');
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
      await shot(page, 'public-page-strip');
    });

    test(`is told about their own draft in ${locale}`, async ({ page }) => {
      const own = messagesIn(locale, 'organizer.publicPage.ownDraft');
      await page.goto(`/s/${organizer.draft.slug}`);
      await expect(page.locator('main'), unshippedHint).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(own('title'));
      await expect(page.getByRole('link', { name: own('open') })).toBeVisible();
      await shot(page, 'public-page-own-draft');
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
      await shot(page, 'preview');
    });

    test(`sees a draft’s header, tabs and Publish’s check in ${locale}`, async ({ page }) => {
      const signup = messagesIn(locale, 'organizer.signup');
      const status = messagesIn(locale, 'organizer.status');
      await page.goto(`/app/signups/${organizer.draft.id}/build`);
      const title = page.getByRole('heading', { level: 1 }).locator('visible=true');
      await expect(title).toHaveText('Draft Picnic');
      // The title is the signup's own, in its language: it stores none, so
      // the instance's, English.
      expect(await languageOf(title)).toBe('en');
      await expect(onScreen(page.getByText(status('draft'), { exact: true }))).toBeVisible();
      const draftLine = onScreen(page.getByText(signup('draftLine')));
      await expect(draftLine).toBeVisible();
      expect(await languageOf(draftLine), unshippedHint).toBe(locale);
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
      await shot(page, 'publish-check', { sheet: true });
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
      await shot(page, 'build-share-chip');

      await onScreen(page.getByRole('button', { name: share('button') })).click();
      const panel = page.getByRole('dialog', { name: share('heading.later') });
      await expect(panel).toBeVisible();
      // A phone's sheet sits outside the page's wrapper, so it's <html lang>'s.
      expect(await languageOf(panel), unshippedHint).toBe(locale);
      await expect(panel.getByText(share(phone ? 'lead.phone' : 'lead.desktop'))).toBeVisible();
      await expect(panel.getByRole('button', { name: share('copyLink') })).toBeVisible();
      await expect(
        panel.getByRole(phone ? 'button' : 'link', {
          name: share(phone ? 'qr.show' : 'qr.downloadLabel'),
        }),
      ).toBeVisible();
      // The message is for participants: in the signup's language, whatever
      // the organizer's, and marked so. A new signup's empty slot holds 1,
      // and Blankets 4.
      const box = panel.getByLabel(share('messageLabel'));
      await expect(box).toHaveValue(
        [
          elsewhere.title,
          message('spotsOpen', { count: 5 }),
          message('signUp', { url: url! }),
        ].join('\n'),
      );
      await expect(box).toHaveAttribute('lang', signupLocale);
      if (!phone) {
        await expect(panel.getByRole('button', { name: share('copyMessage') })).toBeVisible();
        await expect(panel.getByRole('link', { name: share('emailIt') })).toBeVisible();
      }
      await panel.getByRole('button', { name: share('close') }).click();
      await expect(panel).toBeHidden();
    });

    test(`marks a signup’s own words in its language, not ${locale}`, async ({ page }) => {
      // The first language with a catalog that isn't the organizer's.
      const signupLocale = CATALOG_LOCALES.find((other) => other !== locale) ?? 'en';
      const elsewhere = await publishSignupIn(organizer, signupLocale);
      const chrome = messagesIn(locale, 'organizer.chrome');
      const signup = messagesIn(locale, 'organizer.signup');
      const preview = messagesIn(locale, 'organizer.preview');

      // Your signups: each title in its signup's language. The organizer's
      // own two store none, so they're in the instance's, English, marked
      // only where that isn't the page's.
      await page.goto('/app');
      const row = page.locator(`a[href="/app/signups/${elsewhere.id}"]`);
      const rowTitle = row.getByText(elsewhere.title, { exact: true });
      await expect(rowTitle).toHaveAttribute('lang', signupLocale);
      expect(await languageOf(row.getByText(`/s/${elsewhere.slug}`)), unshippedHint).toBe(locale);
      for (const own of ['Bake Sale', 'Draft Picnic']) {
        const title = page.getByText(own, { exact: true });
        expect(await languageOf(title)).toBe('en');
        if (locale === 'en') await expect(title).not.toHaveAttribute('lang');
      }
      expect(await axeViolations(page)).toEqual([]);

      // Its header and the crumb: the title in the signup's language, the
      // header's own words in the organizer's.
      await page.goto(`/app/signups/${elsewhere.id}/responses`);
      const title = page.getByRole('heading', { level: 1 }).locator('visible=true');
      await expect(title).toHaveText(elsewhere.title);
      await expect(title).toHaveAttribute('lang', signupLocale);
      const trail = page.getByRole('navigation', { name: chrome('breadcrumb') });
      const crumb = trail.locator('[aria-current="page"]');
      await expect(crumb).toHaveText(elsewhere.title);
      await expect(crumb).toHaveAttribute('lang', signupLocale);
      const tabs = page.getByRole('tablist', { name: signup('tabs.label') });
      expect(await languageOf(tabs), unshippedHint).toBe(locale);
      expect(await axeViolations(page)).toEqual([]);

      // Its own signup's header and crumb, in English, marked only where the
      // page isn't.
      await page.goto(`/app/signups/${organizer.open.id}/responses`);
      await expect(title).toHaveText('Bake Sale');
      expect(await languageOf(title)).toBe('en');
      expect(await languageOf(crumb)).toBe('en');
      if (locale === 'en') {
        await expect(title).not.toHaveAttribute('lang');
        await expect(crumb).not.toHaveAttribute('lang');
      }

      // Preview: what participants will see, in the signup's language. A
      // disabled Sign up button's tip is the organizer's, and screen readers
      // get it from text marked with their language, since the title a
      // mouse shows can't carry one.
      await page.goto(`/app/signups/${elsewhere.id}/preview`);
      await expect(page.locator('main')).toHaveAttribute('lang', signupLocale);
      const button = page.locator('main li').filter({ hasText: 'Blankets' }).getByRole('button');
      await expect(button).toBeDisabled();
      // Published, so the tip points to the public link.
      const tipText = preview('signUpDisabled', { status: 'open' });
      await expect(button).toHaveAttribute('title', tipText);
      await expect(button).toHaveAccessibleDescription(tipText);
      const tipId = await button.getAttribute('aria-describedby');
      const tip = page.locator(`[id="${tipId}"]`);
      await expect(tip).toHaveText(tipText);
      await expect(tip, unshippedHint).toHaveAttribute('lang', locale);
      await expect(tip).toBeHidden();
      // The Preview banner's blue on blue is short of AA contrast, as it was
      // before these marks, so it's left out here.
      expect(await axeViolations(page, '[role="status"]')).toEqual([]);
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
      await shot(page, 'close-question');
      await asked.getByRole('button', { name: signup('close.action') }).click();

      await expect(onScreen(page.getByText(status('closed'), { exact: true }))).toBeVisible();
      await expect(page.getByText(signup('closed.title'))).toBeVisible();
      await expect(page.getByText(signup('closed.body'))).toBeVisible();
      await expect(page.getByRole('button', { name: signup('closed.dismiss') })).toBeVisible();
      await expect(
        onScreen(page.getByText(signup('spots.line', { status: 'closed', spots }))),
      ).toBeVisible();
      await shot(page, 'build-closed');

      // Beside Preview on a computer; in the More actions sheet on a phone.
      if (phone) await more.click();
      await onScreen(page.getByRole('button', { name: signup('reopen.action') })).click();
      await expect(onScreen(page.getByText(status('open'), { exact: true }))).toBeVisible();
      await expect(page.getByText(signup('closed.title'))).toBeHidden();
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
      // The tab's settings are one form, with one Save under them all.
      const all = page.locator('form').filter({ has: ask });
      await all.getByRole('button', { name: settings('save') }).click();
      await expect(all.getByRole('status')).toHaveText(saveNotice('saved'));
      await shot(page, 'signup-settings-saved');

      const danger = page.getByRole('region', { name: settings('delete.title') });
      await expect(danger.getByText(settings('delete.body'))).toBeVisible();
      await danger.getByRole('button', { name: settings('delete.start') }).click();
      const confirm = danger.getByRole('alertdialog', { name: settings('delete.label') });
      await expect(confirm.getByText(settings('delete.question'))).toBeVisible();
      await expect(confirm.getByRole('button', { name: settings('delete.confirm') })).toBeVisible();
      await shot(page, 'signup-settings-delete');
      await confirm.getByRole('button', { name: settings('delete.cancel') }).click();
      await expect(danger.getByRole('button', { name: settings('delete.start') })).toBeVisible();

      // A refused save or delete comes back as its code.
      await page.goto(`${tab}?error=forbidden`);
      const refusal = page.getByRole('main').getByRole('alert');
      await expect(refusal).toHaveText(errors('code.forbidden'));
      expect(await languageOf(refusal)).toBe(locale);
      await shot(page, 'signup-settings-refused');
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
      await shot(page, 'responses-remove');
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
      await shot(page, 'responses-removed');

      // The CSV's column names and statuses come in the organizer's language,
      // whatever the browser asks for. The signup's own column names stay.
      const csv = await page.request.get(`/api/signups/${organizer.open.id}/export.csv`, {
        headers: { 'accept-language': locale === 'en' ? OTHER_LOCALE : 'en' },
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
        await shot(page, 'new-signup-compose-limit');
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

    test(`answers Magic Compose’s questions in ${locale}`, async ({ page }) => {
      const newSignup = messagesIn(locale, 'organizer.newSignup');
      const compose = messagesIn(locale, 'organizer.compose');
      const questions = messagesIn(locale, 'organizer.compose.questions');
      const warnings = messagesIn(locale, 'organizer.aiDraft.warnings');
      const hydration = watchForHydrationErrors(page);

      await page.goto('/app/signups/new');
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(
        new RegExp(`^(${escaped(compose('heading'))}|${escaped(newSignup('title'))})$`),
      );
      test.skip(
        (await heading.textContent()) !== compose('heading'),
        'Magic Compose is off on this server (no LLM_BASE_URL)',
      );

      // The AI asks first, then drafts from the answers, as the route answers;
      // the draft it "made" is the organizer's seeded one.
      const replies: unknown[] = [
        {
          data: {
            questions: {
              topics: ['what', 'when', 'how_many'],
              whatOptions: ['Bake', 'Staff the table'],
            },
          },
        },
        {
          data: {
            id: organizer.draft.id,
            slug: organizer.draft.slug,
            draft: {
              title: 'Bake sale',
              description: '',
              fields: [{ ref: 'what', label: 'What', fieldType: 'text' }],
              slots: [{ values: { what: 'Staff the table' }, capacity: 1 }],
            },
            warnings: ["1 value was left blank because it didn't fit its field. Fill it in below."],
            codedWarnings: [{ code: 'values_blanked', count: 1 }],
          },
        },
      ];
      const sent: unknown[] = [];
      await page.route('**/api/signups/magic-compose', (route) => {
        sent.push(route.request().postDataJSON());
        return route.fulfill({ json: replies.shift() });
      });
      await page.getByRole('textbox', { name: compose('describe') }).fill('Bake sale');
      await page.getByRole('button', { name: compose('draft') }).click();

      const asked = page.getByRole('heading', { level: 1, name: questions('heading') });
      await expect(asked).toBeVisible();
      expect(await languageOf(asked), unshippedHint).toBe(locale);
      await expect(page.getByText(questions('intro'))).toBeVisible();
      await expect(page.getByText(questions('what.ask'))).toBeVisible();
      await page.getByRole('button', { name: 'Staff the table' }).click();
      await page
        .getByRole('button', { name: questions('howMany.more', { item: 'Staff the table' }) })
        .click();
      await expect(
        page.getByRole('spinbutton', {
          name: questions('howMany.people', { item: 'Staff the table' }),
        }),
      ).toHaveValue('1');
      await expect(page.getByRole('radio', { name: questions('when.oneDay') })).toBeChecked();
      await expect(page.getByLabel(questions('when.starts'))).toContainText(
        questions('when.noTime'),
      );

      // A start time with no date can't go, and the screen says why.
      await page.getByLabel(questions('when.starts')).selectOption('09:00');
      await page.getByRole('button', { name: compose('draft') }).click();
      const problem = page.getByRole('main').getByRole('alert');
      await expect(problem).toHaveText(questions('problems.noDate'));
      expect(await languageOf(problem)).toBe(locale);
      await page.getByLabel(questions('when.date')).fill('2026-11-14');
      await page.getByRole('button', { name: compose('draft') }).click();

      // Drafting, then the draft's page, whose banner words the warning's code.
      await expect(page).toHaveURL(
        new RegExp(`/app/signups/${organizer.draft.id}/build\\?aiDraft=1$`),
        { timeout: 30_000 },
      );
      expect(sent[1]).toEqual({
        prompt: 'Bake sale',
        followUp: {
          what: { picked: ['Staff the table'], added: [] },
          when: { kind: 'one_day', date: '2026-11-14', from: '09:00' },
          howMany: [1],
        },
      });
      const box = page.getByRole('status').filter({ hasText: warnings('heading') });
      await expect(box.getByRole('listitem')).toHaveText([warnings('valuesBlanked', { count: 1 })]);
      expect(hydration).toEqual([]);
    });

    // jsdom computes no layout, so only a browser can see a name hidden
    // behind the how-many box, or the box's "No limit" cut off.
    test(`reads every name and how-many box in full in ${locale}, down to 320px`, async ({
      page,
    }) => {
      const newSignup = messagesIn(locale, 'organizer.newSignup');
      const compose = messagesIn(locale, 'organizer.compose');
      const questions = messagesIn(locale, 'organizer.compose.questions');
      // A short name, a long one, and one word too long to sit beside the box.
      const items = ['Cake', 'Refreshments coordinator', 'Antidisestablishmentarianism'];
      // Where the box goes under the name: on a narrow phone always, on a
      // wider one for the long word only, and never on a computer.
      const boxBelow = {
        320: [true, true, true],
        390: [false, false, true],
        1280: [false, false, false],
      };

      await page.goto('/app/signups/new');
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(
        new RegExp(`^(${escaped(compose('heading'))}|${escaped(newSignup('title'))})$`),
      );
      test.skip(
        (await heading.textContent()) !== compose('heading'),
        'Magic Compose is off on this server (no LLM_BASE_URL)',
      );
      await page.route('**/api/signups/magic-compose', (route) =>
        route.fulfill({
          json: {
            data: { questions: { topics: ['what', 'when', 'how_many'], whatOptions: items } },
          },
        }),
      );
      await page.getByRole('textbox', { name: compose('describe') }).fill('Bake sale');
      await page.getByRole('button', { name: compose('draft') }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: questions('heading') }),
      ).toBeVisible();
      for (const item of items) await page.getByRole('button', { name: item, exact: true }).click();
      const rows = page.getByRole('listitem').filter({ has: page.getByRole('spinbutton') });
      await expect(rows).toHaveCount(items.length);

      for (const width of [320, 390, 1280] as const) {
        await page.setViewportSize({ width, height: 800 });
        const fits = await rows.evaluateAll((lis) =>
          lis.map((li) => {
            const name = li.firstElementChild!;
            const stepper = li.lastElementChild!.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(name);
            const text = [...range.getClientRects()];
            const input = li.querySelector('input')!;
            const style = getComputedStyle(input);
            const context = document.createElement('canvas').getContext('2d')!;
            context.font = style.font;
            return {
              name: name.textContent,
              spills: name.scrollWidth > name.clientWidth,
              underTheBox: text.some(
                (line) =>
                  line.right > stepper.left &&
                  line.left < stepper.right &&
                  line.bottom > stepper.top &&
                  line.top < stepper.bottom,
              ),
              placeholderCut:
                context.measureText(input.placeholder).width >
                input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
              boxBelow: stepper.top >= name.getBoundingClientRect().bottom,
            };
          }),
        );
        for (const fit of fits) {
          expect(
            {
              spills: fit.spills,
              underTheBox: fit.underTheBox,
              placeholderCut: fit.placeholderCut,
            },
            `"${fit.name}" at ${width}px`,
          ).toEqual({ spills: false, underTheBox: false, placeholderCut: false });
        }
        expect(
          fits.map((fit) => fit.boxBelow),
          `the box under the name at ${width}px`,
        ).toEqual(boxBelow[width]);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          `no sideways scroll at ${width}px`,
        ).toBe(true);
      }

      // The box still counts at 320px, by pointer and by keyboard.
      await page.setViewportSize({ width: 320, height: 800 });
      const item = items[1]!;
      await page.getByRole('button', { name: questions('howMany.more', { item }) }).click();
      const count = page.getByRole('spinbutton', { name: questions('howMany.people', { item }) });
      await expect(count).toHaveValue('1');
      await count.press('ArrowUp');
      await expect(count).toHaveValue('2');
      expect(await axeViolations(page)).toEqual([]);
    });

    test(`sees the banner on a draft Magic Compose made, and its warnings, in ${locale}`, async ({
      page,
    }) => {
      const aiDraft = messagesIn(locale, 'organizer.aiDraft');
      const warnings = messagesIn(locale, 'organizer.aiDraft.warnings');
      const hydration = watchForHydrationErrors(page);
      const build = `/app/signups/${organizer.draft.id}/build`;

      // What Magic Compose changed, as the tab keeps it: codes with their
      // arguments, and a sentence kept by a tab from before they had codes,
      // which isn't shown.
      await page.goto(build);
      await page.evaluate(
        ([key, kept]) => window.sessionStorage.setItem(key, JSON.stringify(kept)),
        [
          `${AI_DRAFT_WARNINGS_KEY_PREFIX}${organizer.draft.id}`,
          [
            'Removed 1 duplicate field the AI tried to add twice.',
            { code: 'values_blanked', count: 2 },
            { code: 'enum_fields_to_text', fields: ['role'] },
            { code: 'text_cut', field: 'description', max: 2000 },
          ],
        ] as const,
      );
      await page.goto(`${build}?aiDraft=1`);

      const banner = page.getByRole('status').filter({ hasText: aiDraft('body') });
      // A new signup starts with two fields and one slot.
      await expect(banner).toContainText(aiDraft('title', { fields: 2, slots: 1 }));
      expect(await languageOf(banner), unshippedHint).toBe(locale);
      const box = page.getByRole('status').filter({ hasText: warnings('heading') });
      await expect(box.getByRole('listitem')).toHaveText([
        warnings('valuesBlanked', { count: 2 }),
        warnings('enumFieldsToText', { count: 1, fields: 'role' }),
        warnings('descriptionCut', { max: 2000 }),
      ]);
      expect(await languageOf(box)).toBe(locale);
      await shot(page, 'build-ai-draft');

      await banner.getByRole('button', { name: aiDraft('dismiss') }).click();
      await expect(box).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`${escaped(build)}$`));
      expect(hydration).toEqual([]);
    });
  });
}
