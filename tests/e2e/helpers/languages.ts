import { expect, type BrowserContext, type Page } from '@playwright/test';
import { UNSHIPPED_TEST_LOCALES, type TestLocale } from '@/i18n/testing/locales';
import { getTranslator, type Namespace } from '@/i18n/translator';
import { COMMIT_COOKIE_NAME, serializeReturningCommits } from '@/lib/returning-participant';
import { BASE_URL } from './fixtures';
import type { Remembered } from './seed';

/**
 * `namespace`'s messages in `locale`, from its catalog, formatted as vitest
 * and the reminder worker format them, to hold the built pages to: the web
 * process formats the precompiled catalog, so a page that reads the same
 * shows both agree. A message the catalog lacks comes out in English, as it
 * would on the page; a key English lacks too throws.
 */
export function messagesIn<N extends Namespace>(locale: TestLocale, namespace: N) {
  return getTranslator(locale, namespace, {
    onError: (error) => {
      throw error;
    },
  });
}

/**
 * Opens `path` on a seeded signup in `locale` (`seed.languages[locale]`) and
 * checks its page is in that language. A language that hasn't shipped shows
 * only on a server started with it in `E2E_UNSHIPPED_LOCALES`:
 * playwright.config.ts gives the list to the server it starts, but a server
 * already running (a reused `pnpm dev`) needs it too, and this says so rather
 * than failing on English text.
 */
export async function gotoIn(page: Page, locale: TestLocale, path: string): Promise<void> {
  await page.goto(path);
  await expect(
    page.locator('main'),
    `the signup in ${locale} is in English: start the server with E2E_UNSHIPPED_LOCALES=${UNSHIPPED_TEST_LOCALES.join(',')}`,
  ).toHaveAttribute('lang', locale);
}

/**
 * Makes the browser remember a seeded sign-up as the one that made it would,
 * in the returning-participant cookie, so the signup's page shows its person
 * their own spot. Nothing on the server changes.
 */
export async function remember(context: BrowserContext, signUp: Remembered): Promise<void> {
  const { signupId, commitmentId, token } = signUp;
  await context.addCookies([
    {
      name: COMMIT_COOKIE_NAME,
      value: serializeReturningCommits([{ commitmentId, token, signupId }]),
      url: BASE_URL,
    },
  ]);
}

/**
 * Passed as a message's argument, it marks where any text may go in a
 * pattern made by `matching`: a private-use character no catalog holds.
 */
const ANY_TEXT = '\uE000';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A formatted message as a pattern for the whole of a text: any text where it
 * has `ANY_TEXT`, and, given `count`, any number where it has `count` as the
 * language writes it. So `dialog('signUpFor', { slot: ANY_TEXT })` matches
 * the Sign up button of any slot ("Anmäl dig till …" in Swedish), and
 * `slot('left', { left: 19 })` with `count: 19` matches "19 kvar" or "18
 * kvar", whatever the language's digits.
 */
export function matching(
  text: string,
  { locale, count }: { locale?: TestLocale; count?: number } = {},
): RegExp {
  let source = escape(text).split(ANY_TEXT).join('.+');
  if (count !== undefined) {
    const shown = escape(new Intl.NumberFormat(locale).format(count));
    source = source.split(shown).join('\\p{Nd}+');
  }
  return new RegExp(`^${source}$`, 'u');
}

/** The Sign up button on a slot's row, in `locale`, whatever the slot. */
export function signUpButton(locale: TestLocale): RegExp {
  return matching(messagesIn(locale, 'participant.dialog')('signUpFor', { slot: ANY_TEXT }));
}
