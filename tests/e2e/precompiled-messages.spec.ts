import { expect, test } from '@playwright/test';
import { englishName, TEST_LOCALES } from '@/i18n/testing/locales';
import { loadSeed } from './helpers/fixtures';
import { gotoIn, matching, messagesIn, signUpButton } from './helpers/languages';

/**
 * Messages with arguments, formatted the way production formats them.
 *
 * In the Next build, next-intl's loader compiles the message catalogs and the
 * web process formats them with use-intl's precompiled formatter
 * (`precompile` in next.config.mjs). Vitest and the reminder worker read the
 * raw JSON and use the full formatter, so only a real build shows what pages
 * print. The footer's `{instance} · AGPL-3.0` is checked on every kind of
 * page, a slot row's count on the public signup page, and the text client
 * components read in the browser, in English and on the seeded signup in
 * each test language, whose plurals and number formats are its own. Broken,
 * a message prints its key path, like `common.footer.license` (a compiled
 * message mangled on its way to the translator), or its own text, like
 * `{instance} · AGPL-3.0` (a message that skipped the loader, which this
 * formatter leaves unfilled). A test language's expected text comes from its
 * catalog through the full formatter (`messagesIn`), so the two formatters
 * must agree on the built page.
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

  for (const locale of TEST_LOCALES) {
    const language = englishName(locale);
    test(`counts in ${language} on the ${language} signup, plurals and all`, async ({ page }) => {
      const { slug, slots, noDateHeading } = seed.languages[locale].open;
      const slot = messagesIn(locale, 'participant.slot');
      await gotoIn(page, locale, `/s/${slug}`);
      const row = (label: string) => page.locator('li').filter({ hasText: label });
      // 19 of 20 left, as seeded; any number, as other specs may sign up.
      const left = matching(slot('left', { left: 19 }), { locale, count: 19 });
      const leftOf = matching(slot('leftOf', { left: 19, capacity: 20 }), { locale, count: 19 });
      await expect(
        row(slots.many).locator('[aria-hidden="true"]').filter({ hasText: left }),
      ).toHaveText(left);
      await expect(row(slots.many).locator('.sr-only').filter({ hasText: leftOf })).toHaveText(
        leftOf,
      );
      // One and two people on slots with no limit: the plural's two branches.
      await expect(row(slots.unlimitedOne).locator('.sr-only')).toHaveText(
        slot('signedUp', { count: 1 }),
      );
      await expect(row(slots.unlimitedTwo).locator('.sr-only')).toHaveText(
        slot('signedUp', { count: 2 }),
      );
      // The date field's label goes into "(no {label})" lowercased.
      await expect(page.getByRole('heading', { name: noDateHeading })).toBeVisible();
    });
  }
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

  // A plural with numbers, a select, and a tag around an argument, formatted
  // in the browser.
  test('fills in the sign-up sheet’s messages with arguments', async ({ page }) => {
    await page.goto(`/s/${seed.optionalEmailSlug}`);
    const row = page.locator('li').filter({ hasText: seed.optionalEmailSlotLabel });
    await row.getByRole('button', { name: 'Sign up' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toHaveAccessibleDescription(/^\d+ of 20 spots left$/);
    const email = sheet.getByRole('textbox', { name: 'Email (optional)' });
    // The seeded slot has no date, so the select leaves the reminder out.
    await expect(email).toHaveAccessibleDescription(
      "We'll email you your link to change or cancel. Without an email, save the link we show you after you sign up.",
    );
    await email.fill('pat@gmial.com');
    const suggestion = sheet.getByRole('button', { name: 'pat@gmail.com' });
    await expect(suggestion.locator('..')).toHaveText('Did you mean pat@gmail.com?');
  });

  for (const locale of TEST_LOCALES) {
    test(`fills in the ${englishName(locale)} sign-up sheet’s messages with arguments`, async ({
      page,
    }) => {
      const { slug, slots } = seed.languages[locale].open;
      const dialog = messagesIn(locale, 'participant.dialog');
      const fields = messagesIn(locale, 'participant.fields');
      const slot = messagesIn(locale, 'participant.slot');
      await gotoIn(page, locale, `/s/${slug}`);
      const open = async (label: string) => {
        const row = page.locator('li').filter({ hasText: label });
        await row.getByRole('button', { name: signUpButton(locale) }).click();
        return page.getByRole('dialog');
      };

      const sheet = await open(slots.many);
      await expect(sheet).toHaveAccessibleDescription(
        matching(slot('leftOf', { left: 19, capacity: 20 }), { locale, count: 19 }),
      );
      const email = sheet.getByRole('textbox', { name: fields('emailOptional') });
      // A dated slot, with reminders on: the select's `yes`.
      await expect(email).toHaveAccessibleDescription(dialog('emailHelp', { reminder: 'yes' }));
      await email.fill('pat@gmial.com');
      const suggestion = sheet.getByRole('button', { name: 'pat@gmail.com' });
      await expect(suggestion.locator('..')).toHaveText(
        dialog.markup('didYouMean', { email: 'pat@gmail.com', suggestion: (chunks) => chunks }),
      );
      await sheet.getByRole('button', { name: dialog('cancel') }).click();
      await expect(sheet).toBeHidden();

      // No date, so no reminder: the select's other branch.
      const undated = await open(slots.unlimitedOne);
      await expect(
        undated.getByRole('textbox', { name: fields('emailOptional') }),
      ).toHaveAccessibleDescription(dialog('emailHelp', { reminder: 'no' }));
    });
  }

  test('names the box on the edit page, rendered on the server and then in the browser', async ({
    page,
  }) => {
    await page.goto(`/s/${seed.editSlug}/c/${seed.editCommitmentId}?token=${seed.editToken}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('textbox', { name: 'Your name' })).toBeVisible();
  });
});
