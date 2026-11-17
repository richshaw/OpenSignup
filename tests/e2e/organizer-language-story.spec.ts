import { expect, test } from '@playwright/test';
import { CATALOG_LOCALES, isShipped, languageName, languageNameInSentence } from '@/i18n/config';
import { loginAsSeededOrganizer } from './helpers/auth';
import { sentConfirmation } from './helpers/confirmation-email';
import {
  createOrganizerIn,
  languageOf,
  messagesIn,
  publishForParticipants,
} from './helpers/organizer-language';
import { unshippedHint as howToShow } from './helpers/unshipped-locales';

/** `text` as a regular expression that matches only itself. */
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The owner's story, once through for each language with a catalog besides
 * English: an organizer sets their language, their screens are in it, the
 * signup they make starts in it, and so do its page and the confirmation
 * email a participant gets. organizer-language.spec.ts checks each organizer
 * screen in depth, and translated signups' specs each participant screen;
 * this checks one thing on each, to show the language carries all the way.
 *
 * A language that hasn't shipped can't be chosen in account Settings, and a
 * new signup doesn't start in it (`newSignupLocale`). Until it ships, the
 * spec writes it into the account's row and the new signup's, and the server
 * shows it with it in `E2E_UNSHIPPED_LOCALES`, as playwright.config.ts starts
 * it. Once it ships, the spec chooses it in account Settings and checks the
 * signup starts in it, with nothing written. Then it presses the two other
 * language controls: the signup's own, on its Settings tab, and the button in
 * account Settings that switches the organizer's open signups to their
 * language. Neither shows before the language ships.
 */
for (const locale of CATALOG_LOCALES.filter((other) => other !== 'en')) {
  const launched = isShipped('participant', locale);
  const unshippedHint = `nothing is in ${locale}: ${howToShow(locale)}`;

  test(`an organizer who sets their language to ${locale} gets it everywhere, and so do participants`, async ({
    page,
    browser,
  }) => {
    const organizer = await createOrganizerIn(
      launched ? null : locale,
      `story-${test.info().project.name}`,
    );
    await loginAsSeededOrganizer(page.context(), { sessionToken: organizer.sessionToken });

    // Their language, in account Settings.
    if (launched) {
      await page.goto('/app/settings');
      await page.getByRole('radio', { name: languageName(locale) }).check();
      await page
        .getByRole('button', { name: messagesIn('en', 'organizer.settings')('language.save') })
        .click();
      const saveNotice = messagesIn(locale, 'organizer.saveNotice');
      await expect(page.getByRole('status')).toHaveText(saveNotice('saved'));
      // With no reload: a server action that redirects renders the whole page
      // it goes to, its root layout included.
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    }

    // Your signups.
    await page.goto('/app');
    const dashboard = messagesIn(locale, 'organizer.dashboard');
    const heading = page.getByRole('heading', { level: 1, name: dashboard('title') });
    await expect(heading, unshippedHint).toBeVisible();
    expect(await languageOf(heading), unshippedHint).toBe(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);

    // A new signup, from the form, which opens its Build tab.
    const newSignup = messagesIn(locale, 'organizer.newSignup');
    const title = `Picnic ${Date.now()}`;
    await page.goto('/app/signups/new?manual=1');
    await page.getByLabel(newSignup('titleLabel')).fill(title);
    await page.getByRole('button', { name: newSignup('create') }).click();
    await page.waitForURL(/\/app\/signups\/(sig_\w+)\/build$/);
    const signupId = /\/app\/signups\/(sig_\w+)\/build$/.exec(page.url())?.[1] ?? '';
    const build = messagesIn(locale, 'organizer.build');
    const fields = page.getByRole('button', { name: build('rail.fields', { count: 2 }) });
    await expect(fields.locator('visible=true')).toBeVisible();
    expect(await languageOf(fields.locator('visible=true'))).toBe(locale);

    // It starts in their language, as its Settings tab says once there's a choice.
    const { slug, slotId } = await publishForParticipants(
      organizer,
      signupId,
      launched ? undefined : locale,
    );
    const signupSettings = messagesIn(locale, 'organizer.signupSettings');
    await page.goto(`/app/signups/${signupId}/settings`);
    const form = page.getByRole('region', { name: signupSettings('signupForm.title') });
    await expect(form).toBeVisible();
    expect(await languageOf(form)).toBe(locale);
    if (launched) {
      const language = page.getByRole('region', { name: signupSettings('language.title') });
      await expect(language.getByRole('radio', { name: languageName(locale) })).toBeChecked();
    }

    // A participant signs up on its page, from an address of their own (RFC
    // 5737), so the per-IP limit other specs' sign-ups share doesn't count it.
    const participant = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.83' },
    });
    const visitor = await participant.newPage();
    await visitor.goto(`/s/${slug}`);
    await expect(visitor.locator('main'), unshippedHint).toHaveAttribute('lang', locale);
    const dialog = messagesIn(locale, 'participant.dialog');
    const inputs = messagesIn(locale, 'participant.fields');
    const [before] = dialog('signUpFor', { slot: '\u0000' }).split('\u0000');
    await visitor
      .locator('li')
      .filter({ hasText: 'Cookies' })
      .getByRole('button', { name: new RegExp(`^${escaped(before ?? '')}`) })
      .click();
    const sheet = visitor.getByRole('dialog');
    const who = `Kim ${Date.now()}`;
    await sheet.getByLabel(inputs('name')).fill(who);
    await sheet.getByLabel(inputs('email'), { exact: true }).fill(`kim+${Date.now()}@example.test`);
    const committed = visitor.waitForResponse(`**/api/slots/${slotId}/commitments`);
    await sheet.getByRole('button', { name: dialog('confirm') }).click();
    const { data } = await (await committed).json();
    await expect(sheet.getByRole('heading', { name: dialog('youreIn') })).toBeVisible();
    await participant.close();

    // The confirmation email it was sent.
    const token = new URL(data.editUrl).searchParams.get('token') ?? '';
    const email = await sentConfirmation(data.commitment.id, token);
    const subjects = messagesIn(locale, 'email.subject');
    const confirmation = messagesIn(locale, 'email.confirmation');
    expect(email.subject).toContain(subjects('signedUp', { title }));
    expect(email.text).toContain(
      confirmation.markup('intro', { name: who, title, b: (chunks) => chunks }),
    );

    // Responses, with them on it.
    const responses = messagesIn(locale, 'organizer.responses');
    await page.goto(`/app/signups/${signupId}/responses`);
    const summary = page.getByText(responses('summary.signUps', { count: 1 }));
    await expect(summary.locator('visible=true')).toBeVisible();
    expect(await languageOf(summary.locator('visible=true'))).toBe(locale);
    const row = page.getByRole('row').filter({ hasText: who });
    await expect(
      row.getByText(responses('status.confirmed')).locator('visible=true'),
    ).toBeVisible();
    if (!launched) return;

    // The signup's own language, back to English on its Settings tab: its
    // page follows.
    const saved = messagesIn(locale, 'organizer.saveNotice')('saved');
    await page.goto(`/app/signups/${signupId}/settings`);
    const ownLanguage = page.getByRole('region', { name: signupSettings('language.title') });
    // The tab's one form, whose Save says Saved beside it.
    const tab = page.locator('form').filter({ has: ownLanguage });
    await ownLanguage.getByRole('radio', { name: languageName('en') }).check();
    await tab.getByRole('button', { name: signupSettings('save'), exact: true }).click();
    await expect(tab.getByRole('status')).toHaveText(saved);
    await page.goto(`/s/${slug}`);
    await expect(page.locator('main')).toHaveAttribute('lang', 'en');

    // Account Settings offers to switch the organizer's open signups that
    // aren't in their language: this one, and the open signup their account
    // was made with, which started in English, as everything did before they
    // chose. Both follow, and the draft doesn't count.
    const account = messagesIn(locale, 'organizer.settings');
    const named = {
      count: 2,
      name: languageNameInSentence(locale, locale),
      language: (chunks: string) => chunks,
    };
    await page.goto('/app/settings');
    await page.getByRole('button', { name: account.markup('language.switch', named) }).click();
    await expect(page.getByRole('status')).toHaveText(account.markup('language.switched', named));
    for (const switched of [slug, organizer.open.slug]) {
      await page.goto(`/s/${switched}`);
      await expect(page.locator('main')).toHaveAttribute('lang', locale);
    }
  });
}
