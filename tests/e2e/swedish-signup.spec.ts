import { expect, test, type Locator } from '@playwright/test';
import { getTranslator, type Namespace } from '@/i18n/translator';
import { formatSlotDate } from '@/lib/slot-label';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';
import { gotoSwedish } from './helpers/swedish';

const seed = loadSeed();
const {
  id,
  slug,
  title,
  slots,
  noDateHeading,
  manyDate,
  editPath,
  unsubscribePath,
  editName,
  editEmail,
  cancelledEditPath,
  optedOutUnsubscribePath,
  optedOutEmail,
} = seed.swedish;

/**
 * Swedish from the catalog, formatted as vitest and the worker format it, to
 * hold the built pages to: the web process formats the precompiled catalog,
 * so a page that reads the same shows both agree. Throws on a missing key.
 */
function swedish<N extends Namespace>(namespace: N) {
  return getTranslator('sv', namespace, {
    onError: (error) => {
      throw error;
    },
  });
}

/** A rich message as the page shows it: its text, tags and all left as text. */
const plain = (chunks: string) => chunks;

/** The English these pages showed, none of which a Swedish page may keep. */
const ENGLISH =
  /\b(Your|You|Save|Saving|Cancel|Keep|Yes|Back|Reminders|Stop|Turn|signup|spots?|slot|link|Sorry)\b/;

async function expectNoEnglish(main: Locator) {
  await expect(main).not.toHaveText(ENGLISH);
}

/** A link with its token swapped for one that was never issued. */
const badToken = (path: string) => path.replace(/token=[^&]+/, 'token=invalid-token');

/**
 * The seeded Swedish signup (tests/e2e/helpers/seed.ts): its participants'
 * text comes from sv.json, and what only its organizers read stays English,
 * marked so, until the organizer app has other languages.
 */
test.describe('the Swedish test signup', () => {
  test('shows participants its text in Swedish', async ({ page }) => {
    await gotoSwedish(page, `/s/${slug}`);
    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(main.getByRole('heading', { name: noDateHeading })).toBeVisible();
    const row = (label: string) => main.locator('li').filter({ hasText: label });
    await expect(row(slots.one).getByRole('button', { name: /^Anmäl dig till / })).toHaveText(
      'Anmäl dig',
    );
    await expect(row(slots.full)).toContainText('Fullt');
    await expect(main.getByText(/Sign up|Full\b|signed up|spots left/)).toHaveCount(0);
    // Until the signup's pages get a layout of their own (#628), the page
    // around <main> stays English: <html lang> and the footer.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('navigation', { name: 'Footer' })).toBeVisible();
  });

  test('keeps its organizer’s strip English, marked lang="en"', async ({ page, context }) => {
    await loginAsSeededOrganizer(context);
    await gotoSwedish(page, `/s/${slug}`);
    const strip = page.getByRole('navigation', { name: 'Organizer' });
    await expect(strip).toHaveAttribute('lang', 'en');
    await expect(strip).toContainText('Your signup. Only organizers see this bar.');
    await expect(strip.getByRole('link', { name: 'See responses' })).toBeVisible();
    await expect(strip.getByRole('link', { name: 'Edit signup' })).toBeVisible();
  });

  test('keeps the Preview banner English, marked lang="en", over a Swedish page', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    await gotoSwedish(page, `/app/signups/${id}/preview`);
    const banner = page.locator('main [lang="en"]');
    await expect(banner).toContainText('Preview');
    await expect(banner).toContainText(
      'This signup is live. The page below shows what visitors see.',
    );
    // The disabled button is the participants', with the organizer's tip.
    const button = page
      .locator('li')
      .filter({ hasText: slots.one })
      .getByRole('button', { name: /^Anmäl dig till / });
    await expect(button).toBeDisabled();
    await expect(button).toHaveText('Anmäl dig');
    await expect(button).toHaveAttribute('title', 'Preview: publish to enable signups');
  });
});

// A sign-up's own pages take the signup's language from the row their link
// reads, and a broken link's page from the signup its path names.
test.describe('the Swedish test signup’s edit page', () => {
  const t = swedish('participant.editPage');
  const form = swedish('participant.editForm');

  test('is in Swedish, with the slot’s date and the spots line', async ({ page }) => {
    await gotoSwedish(page, editPath);
    const main = page.locator('main');
    await expect(page).toHaveTitle(new RegExp(`^${t('title')}`));
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(t('title'));
    await expect(main.getByRole('link', { name: t('back') })).toHaveAttribute('href', `/s/${slug}`);
    await expect(main).toContainText(`${slots.many} · ${formatSlotDate(manyDate, 'sv')}`);
    await expect(
      main.getByText(t('editingAsWithEmail', { name: editName, email: editEmail })),
    ).toBeVisible();
    // The plural's other: the slot has room for 20.
    await expect(main.getByText(form('spotsMax', { max: 20 }))).toBeVisible();
    await expect(main.getByLabel('Ditt namn')).toHaveValue(editName);
    await expect(main.getByRole('button', { name: form('save') })).toBeVisible();
    await expect(main.getByRole('button', { name: form('cancel') })).toBeVisible();
    await expectNoEnglish(main);
  });

  test('asks before cancelling, in Swedish', async ({ page }) => {
    await gotoSwedish(page, editPath);
    await page.getByRole('button', { name: form('cancel') }).click();
    const question = page.getByRole('alertdialog', { name: form('confirmCancel') });
    await expect(question).toContainText(form('cancelQuestion'));
    await expect(question.getByRole('button', { name: form('yesCancel') })).toBeVisible();
    await expectNoEnglish(page.locator('main'));
    // Kept: the seeded sign-up stays for the other specs.
    await question.getByRole('button', { name: form('keep') }).click();
    await expect(page.getByRole('button', { name: form('cancel') })).toBeVisible();
  });

  // The answers are faked, so the seeded sign-up stays as it is.
  test('says a save worked, or why not, in Swedish, down to 1 spot', async ({ page }) => {
    await gotoSwedish(page, editPath);
    let answer = { status: 200, body: { data: {} } as object };
    await page.route('**/api/commitments/**', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: answer.status, json: answer.body })
        : route.continue(),
    );
    const main = page.locator('main');

    await main.getByRole('button', { name: form('save') }).click();
    await expect(main.getByRole('status')).toHaveText(form('saved'));

    // Someone took the rest of the slot since: the plural's one.
    answer = {
      status: 409,
      body: {
        error: {
          code: 'capacity_full',
          message: 'only 1 left',
          details: { remaining: 1, requested: 3, capacity: 20 },
        },
      },
    };
    await main.getByLabel(swedish('participant.fields')('spots')).fill('3');
    await main.getByRole('button', { name: form('save') }).click();
    const errors = swedish('participant.errors');
    await expect(main.getByRole('alert')).toHaveText(
      `${errors('capacity.atMost', { remaining: 1, requested: 3 })} ${errors('capacity.keepYourOne')}`,
    );
    await expect(main.getByText(form('spotsMax', { max: 1 }))).toBeVisible();
    await expectNoEnglish(main);
  });

  test('says a cancelled sign-up was cancelled, in Swedish', async ({ page }) => {
    await gotoSwedish(page, cancelledEditPath);
    const cancelled = swedish('participant.cancelledPage');
    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(cancelled('title'));
    await expect(main).toContainText(cancelled('open'));
    await expect(main).toContainText(`${slots.many} · ${formatSlotDate(manyDate, 'sv')}`);
    await expect(main.getByRole('link', { name: cancelled('back') })).toHaveAttribute(
      'href',
      `/s/${slug}`,
    );
    await expectNoEnglish(main);
  });

  test('says a broken edit link isn’t working, in Swedish, with a 404', async ({ page }) => {
    const response = await page.goto(badToken(editPath));
    expect(response?.status()).toBe(404);
    const gone = swedish('participant.gonePage');
    const main = page.locator('main');
    await expect(main).toHaveAttribute('lang', 'sv');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(gone('editLink.title'));
    await expect(main).toContainText(gone('editLink.body'));
    await expectNoEnglish(main);
  });
});

test.describe('the Swedish test signup’s unsubscribe page', () => {
  const t = swedish('participant.unsubscribe');
  const parts = { title, b: plain };

  /** The page's heading, its sentence with the signup's title in bold, and its controls. */
  async function expectPage(
    main: Locator,
    heading: string,
    sentence: string,
    controls: [string, string],
  ) {
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(main.locator('p:has(strong)')).toHaveText(sentence);
    await expect(main.locator('p strong')).toHaveText(title);
    const [button, other] = controls;
    await expect(main.getByRole('button', { name: button })).toBeVisible();
    await expect(main.getByRole('link', { name: other })).toBeVisible();
    await expectNoEnglish(main);
  }

  test('asks before stopping, and says when reminders are back on, in Swedish', async ({
    page,
  }) => {
    await gotoSwedish(page, unsubscribePath);
    await expect(page).toHaveTitle(new RegExp(`^${t('title')}`));
    const main = page.locator('main');
    await expectPage(
      main,
      t('confirm.title'),
      t.markup('confirm.bodyWithEmail', { ...parts, email: editEmail }),
      [t('stop'), t('keep')],
    );

    await gotoSwedish(page, `${unsubscribePath}&done=on`);
    await expectPage(
      main,
      t('turnedOn.title'),
      t.markup('turnedOn.bodyWithEmail', { ...parts, email: editEmail }),
      [t('stop'), t('keep')],
    );

    await gotoSwedish(page, `${unsubscribePath}&error=off`);
    await expect(main.getByRole('alert')).toHaveText(t('turnOffFailed'));
  });

  test('says reminders are off, or were just turned off, in Swedish', async ({ page }) => {
    await gotoSwedish(page, optedOutUnsubscribePath);
    const main = page.locator('main');
    await expectPage(
      main,
      t('areOff.title'),
      t.markup('areOff.bodyWithEmail', { ...parts, email: optedOutEmail }),
      [t('turnBackOn'), t('back')],
    );

    await gotoSwedish(page, `${optedOutUnsubscribePath}&done=off`);
    await expectPage(main, t('turnedOff.title'), t.markup('turnedOff.body', parts), [
      t('turnBackOn'),
      t('back'),
    ]);

    await gotoSwedish(page, `${optedOutUnsubscribePath}&error=on`);
    await expect(main.getByRole('alert')).toHaveText(t('turnOnFailed'));
  });

  test('explains a link it can’t use, in the Swedish signup’s language', async ({ page }) => {
    const main = page.locator('main');
    await gotoSwedish(page, `/s/${slug}/unsubscribe`);
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(t('incomplete.title'));
    await expect(main).toContainText(t('incomplete.body'));
    await expectNoEnglish(main);

    await gotoSwedish(page, badToken(unsubscribePath));
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(t('invalid.title'));
    await expect(main).toContainText(t('invalid.body'));
    await expectNoEnglish(main);
  });
});
