import { expect, test, type Locator, type Page } from '@playwright/test';
import { isShipped } from '@/i18n/config';
import { englishName, TEST_LOCALES } from '@/i18n/testing/locales';
import type { Namespace } from '@/i18n/translator';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';
import { expectOneLine } from './helpers/label-fit';
import { escaped, messagesIn } from './helpers/languages';
import { noEnglishCheck } from './helpers/no-english';
import { languageOf, storeSignupLanguage } from './helpers/organizer-language';
import { translationShot } from './helpers/translation-shots';
import { unshippedHint as howToShow } from './helpers/unshipped-locales';

const seed = loadSeed();

const NARROW = { width: 320, height: 568 };
const PHONE = { width: 390, height: 844 };
/** The narrowest screen that gets a computer's header (Tailwind's `md`). */
const SMALL_COMPUTER = { width: 768, height: 1024 };

/** What the organizer calls the signup the smoke makes, and its one slot. */
const TITLE = 'Café Mozart';
const SLOT = 'Espresso';

/** The one of a computer's and a phone's copies that's on screen. */
const onScreen = (locator: Locator) => locator.locator('visible=true');

/** A name that starts with `text`, as a tab's does, its count after it. */
const startsWith = (text: string) => new RegExp(`^${escaped(text)}`);

interface SignupFromApi {
  id: string;
  fields: { ref: string; label: string }[];
  slots: { id: string }[];
}

/** A signup of the signed-in organizer's, as the organizer API gives it. */
async function signupFromApi(page: Page, id: string): Promise<SignupFromApi> {
  const response = await page.request.get(`/api/signups/${id}`);
  expect(response.ok(), `GET /api/signups/${id}`).toBe(true);
  return ((await response.json()) as { data: SignupFromApi }).data;
}

/**
 * The organizer app, for an organizer whose account stores each test
 * language (`seed.languages[locale].organizer`): their screens' own text
 * comes from that language's catalog, as far as it has a message, and the
 * page says it's in that language. organizer-language.spec.ts checks each
 * organizer screen's messages one by one, on an organizer the spec makes;
 * this walks through what an organizer does, start to finish, and runs the
 * no-English check the participant pages run (`noEnglishCheck`) over each
 * screen's header, page and open dialog, so a screen, or a part of one, that
 * forgets the organizer's language fails here. The labels of the signup's
 * tabs and header buttons, which longer words could push out of their boxes,
 * are measured at a phone's width.
 *
 * The seed writes the language into the account's row, since one that
 * hasn't shipped can't be stored from the app, and the server shows one that
 * hasn't only with it in `E2E_UNSHIPPED_LOCALES`, as playwright.config.ts
 * starts it. Once the language has shipped, the signup the smoke makes starts
 * in it (`newSignupLocale`), its first two fields named in it. Before then
 * the smoke writes it into the new signup's row (`storeSignupLanguage`), as
 * organizer-language-story.spec.ts does, and the fields keep the English
 * names they were made with, "What" and "Date", which the check doesn't look
 * for.
 */
for (const locale of TEST_LOCALES) {
  const language = englishName(locale);
  const { organizer } = seed.languages[locale];
  const say = <N extends Namespace>(namespace: N) => messagesIn(locale, namespace);
  const unshippedHint = `the organizer app isn’t in ${locale}: ${howToShow(locale)}`;
  const expectNoEnglish = noEnglishCheck(locale, 'organizer');

  /**
   * Saves what's on the page for a translation's review when
   * TRANSLATION_SCREENSHOTS=1 (`pnpm translation:screenshots`), and does
   * nothing otherwise.
   */
  const shot = (page: Page, name: string, options?: { sheet?: boolean }) =>
    translationShot(page, locale, `organizer-${name}`, options);

  /**
   * Checks the page is marked as in `locale`, on `<html>` and on the
   * wrapper round the organizer app's header and pages, and that neither the
   * wrapper nor `dialog`, which sits outside it, has English left.
   */
  async function expectPageIn(page: Page, dialog?: Locator): Promise<void> {
    await expect(page.locator('html'), unshippedHint).toHaveAttribute('lang', locale);
    const wrapper = page.locator('div[lang]:has(> header)');
    await expect(wrapper).toHaveAttribute('lang', locale);
    await expectNoEnglish(wrapper);
    if (dialog) {
      expect(await languageOf(dialog)).toBe(locale);
      await expectNoEnglish(dialog);
    }
  }

  test.describe(`the organizer app in ${language}`, () => {
    test.beforeEach(async ({ context }) => {
      await loginAsSeededOrganizer(context, { sessionToken: organizer.sessionToken });
    });

    test(`makes, builds and publishes a signup in ${language}`, async ({ page }) => {
      const dashboard = say('organizer.dashboard');
      const compose = say('organizer.compose');
      const newSignup = say('organizer.newSignup');
      const signup = say('organizer.signup');
      const build = say('organizer.build');
      const share = say('organizer.share');
      const responses = say('organizer.responses');
      const heading = page.getByRole('heading', { level: 1 });

      // Your signups, with one of theirs in each state.
      await page.goto('/app');
      await expect(heading, unshippedHint).toHaveText(dashboard('title'));
      await expectPageIn(page);
      await shot(page, 'dashboard');

      // New signup: Magic Compose first where the instance has an AI set up
      // (LLM_BASE_URL), then the form.
      await page.getByRole('link', { name: dashboard('newSignup'), exact: true }).click();
      await expect(heading).toHaveText(
        new RegExp(`^(${escaped(compose('heading'))}|${escaped(newSignup('title'))})$`),
      );
      if ((await heading.textContent()) === compose('heading')) {
        await expectPageIn(page);
        await shot(page, 'compose');
        await page.getByRole('link', { name: compose('skip') }).click();
        await expect(heading).toHaveText(newSignup('title'));
      }
      await expectPageIn(page);
      await shot(page, 'new-signup');
      await page.getByLabel(newSignup('titleLabel')).fill(TITLE);
      await page.getByRole('button', { name: newSignup('create') }).click();

      // Its Build tab, with the empty slot a new signup starts with, in the
      // organizer's language as a new signup is once that language ships.
      await page.waitForURL(/\/app\/signups\/sig_\w+\/build$/);
      const signupId = /\/app\/signups\/(sig_\w+)\/build$/.exec(page.url())?.[1] ?? '';
      if (!isShipped('participant', locale)) {
        await storeSignupLanguage(signupId, locale);
        await page.reload();
      }
      const tabs = page.getByRole('tablist', { name: signup('tabs.label') });
      await expect(
        tabs.getByRole('tab', { name: startsWith(signup('tabs.build')) }),
      ).toHaveAttribute('aria-selected', 'true');
      const made = await signupFromApi(page, signupId);
      const what = made.fields.find((field) => field.ref === 'what')?.label ?? '';
      await expectPageIn(page);
      await shot(page, 'build-new');

      // Its fields, which open only once the page has hydrated.
      const fieldsName = startsWith(build('fields.label'));
      await onScreen(page.getByRole('button', { name: fieldsName })).click();
      const fields = page.getByRole('dialog', { name: fieldsName });
      await expect(fields).toBeVisible();
      await expectPageIn(page, fields);
      await shot(page, 'build-fields', { sheet: true });
      await page.keyboard.press('Escape');
      await expect(fields).toBeHidden();

      // Its slot, filled in.
      const row = page.locator('[data-slot-row]').first();
      await expect(row).toContainText(build('empty.named', { label: what.toLowerCase() }));
      await row.click();
      const editor = page.locator('[data-slot-editor]');
      await editor
        .getByRole('textbox', { name: build('editor.value', { field: what }) })
        .fill(SLOT);
      await editor.getByRole('spinbutton', { name: build('editor.spots') }).fill('3');
      await expectPageIn(page);
      await shot(page, 'build-slot');
      await editor.getByRole('button', { name: build('editor.done') }).click();
      await expect(row).toContainText(SLOT);

      // Published, which opens the share panel.
      await onScreen(page.getByRole('button', { name: signup('publish.label') })).click();
      const panel = page.getByRole('dialog', { name: share('heading.firstTime') });
      await expect(panel).toBeVisible();
      await expect(
        onScreen(page.getByText(say('organizer.status')('open'), { exact: true })),
      ).toBeVisible();
      await expectPageIn(page, panel);
      await shot(page, 'share', { sheet: true });
      await panel.getByRole('button', { name: share('close') }).click();
      await expect(panel).toBeHidden();

      // Someone signs up, from an address of their own (RFC 5737), so the
      // per-IP limit other specs' sign-ups share doesn't count it.
      const [slot] = (await signupFromApi(page, signupId)).slots;
      const committed = await page.request.post(`/api/slots/${slot?.id}/commitments`, {
        headers: { 'x-forwarded-for': '203.0.113.84' },
        data: { name: 'Alex', email: `alex+${Date.now()}@example.test`, quantity: 1 },
      });
      expect(committed.ok()).toBe(true);

      // Responses, with them on it.
      await tabs.getByRole('tab', { name: startsWith(signup('tabs.responses')) }).click();
      await page.waitForURL(/\/responses$/);
      await expect(
        onScreen(page.getByText(responses('summary.signUps', { count: 1 }))),
      ).toBeVisible();
      await expect(onScreen(page.getByText('Alex', { exact: true }))).toBeVisible();
      // The header's counts were drawn before the sign-up and only refresh on
      // a load, so reload before the screenshot, or it shows 0 beside Alex.
      await page.reload();
      await expect(onScreen(page.getByText('Alex', { exact: true }))).toBeVisible();
      await expectPageIn(page);
      await shot(page, 'responses');

      // Account Settings, from the header.
      await page.getByRole('banner').locator('a[href="/app/settings"]').click();
      await page.waitForURL(/\/app\/settings$/);
      await expect(heading).toHaveText(say('organizer.settings')('title'));
      await expectPageIn(page);
      await shot(page, 'account-settings');
    });

    // Longer words go in the same boxes: a tab's name or a button's label
    // that wraps or is cut off, or a page that scrolls sideways, fails. Each
    // of the organizer's signups is in a different state, so each of the
    // header's buttons shows on one of them.
    test(`fits the signup tabs and header buttons in ${language}, down to 320px`, async ({
      page,
    }) => {
      const signup = say('organizer.signup');
      const chrome = say('organizer.chrome');
      const share = say('organizer.share');
      const { build, open, closed } = organizer.signups;
      // A draft and an open signup have the phone bar; a closed one has none.
      for (const { id, phoneBar } of [
        { id: build.id, phoneBar: true },
        { id: open.id, phoneBar: true },
        { id: closed.remembered.signupId, phoneBar: false },
      ]) {
        for (const viewport of [NARROW, PHONE]) {
          const where = `at ${viewport.width}px`;
          await page.setViewportSize(viewport);
          await page.goto(`/app/signups/${id}/build`);

          // The tabs: on a 320px screen the strip scrolls sideways, as it
          // does in English, but each name stays whole.
          const strip = page.getByRole('tablist', { name: signup('tabs.label') });
          await expect(strip.getByRole('tab'), `the tabs ${where}`).not.toHaveCount(0);
          for (const tab of await strip.getByRole('tab').all()) await expectOneLine(tab, where);
          if (viewport === PHONE) {
            expect(
              await strip.evaluate((el) => el.scrollWidth <= el.clientWidth),
              `every tab in view ${where}`,
            ).toBe(true);
          }

          // The header across the top: Help, Account and Sign out.
          const banner = page.getByRole('banner');
          await expectOneLine(
            banner.getByRole('link', { name: chrome('help'), exact: true }),
            where,
          );
          await expectOneLine(
            banner.getByRole('link', { name: chrome('account'), exact: true }),
            where,
          );
          await expectOneLine(banner.getByRole('button', { name: chrome('signOut') }), where);

          // The bar along the bottom: a draft's Publish and share, or an
          // open signup's count and Share, side by side on one line.
          const bar = page.locator('[data-phone-bar]');
          await expect(bar, `the phone bar ${where}`).toHaveCount(phoneBar ? 1 : 0);
          if (phoneBar) {
            await expectOneLine(bar, where);
            for (const button of await bar.getByRole('button').all()) {
              await expectOneLine(button, where);
            }
          }

          // The three dots' sheet: Preview, and Close signup or Reopen signup.
          await onScreen(page.getByRole('button', { name: signup('moreActions') })).click();
          const sheet = page.getByRole('dialog');
          await expect(sheet).toBeVisible();
          const items = sheet.locator('a, button').filter({ hasText: /\S/ });
          expect(await items.count(), `the sheet's items ${where}`).toBeGreaterThan(0);
          for (const item of await items.all()) await expectOneLine(item, where);
          await page.keyboard.press('Escape');
          await expect(sheet).toBeHidden();

          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            ),
            `no sideways scroll ${where}`,
          ).toBe(true);
        }

        // A computer's header, at its narrowest: Preview, then Publish and
        // share, Share or Reopen signup.
        await page.setViewportSize(SMALL_COMPUTER);
        await page.goto(`/app/signups/${id}/build`);
        const header = onScreen(page.locator('main header'));
        const action = new RegExp(
          `^(${[signup('publish.label'), share('button'), signup('reopen.action')].map(escaped).join('|')})$`,
        );
        for (const button of [
          header.getByRole('link', { name: signup('preview'), exact: true }),
          header.getByRole('button', { name: action }),
        ]) {
          await expectOneLine(button, `at ${SMALL_COMPUTER.width}px`);
        }
      }
    });
  });
}
