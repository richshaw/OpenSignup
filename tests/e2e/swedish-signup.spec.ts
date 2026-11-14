import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { getTranslator, type Namespace } from '@/i18n/translator';
import { formatSlotDate } from '@/lib/slot-label';
import { participantErrorCopy } from '@/app/s/[slug]/participant-error';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';
import { gotoSwedish, remember } from './helpers/swedish';
import { translationShot } from './helpers/translation-shots';

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
  remembered,
} = seed.swedish;

/**
 * Saves what's on the page for a translation's review when
 * TRANSLATION_SCREENSHOTS=1 (`pnpm translation:screenshots`), and does nothing
 * otherwise. Each screen and state these tests check is saved once it has
 * been checked, so a new one gets its own `shot` too.
 */
const shot = (page: Page, name: string, options?: { sheet?: boolean }) =>
  translationShot(page, 'sv', name, options);

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
    await shot(page, 'page-open');
  });

  // The browser takes an address at `localhost` as an email; the server
  // doesn't, and names the reason, which the sheet words in the signup's
  // language. A new address each run, as the server counts refused ones
  // against the address.
  test('says why a sign-up was refused, in Swedish', async ({ page }) => {
    await gotoSwedish(page, `/s/${slug}`);
    const dialog = swedish('participant.dialog');
    const fields = swedish('participant.fields');
    const errors = swedish('participant.errors');
    await page
      .locator('li')
      .filter({ hasText: slots.one })
      .getByRole('button', { name: /^Anmäl dig till / })
      .click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel(fields('name')).fill('Kim Exempel');
    await sheet.getByLabel(fields('emailOptional')).fill(`kim+${Date.now()}@localhost`);
    await sheet.getByRole('button', { name: dialog('confirm') }).click();

    const alert = sheet.getByRole('alert');
    await expect(alert).toContainText(errors('email.invalid'));
    await expect(alert).toContainText(errors('email.check'));
    await expectNoEnglish(alert);
    await shot(page, 'sheet-error-email-invalid', { sheet: true });
  });

  // Both are made in the browser after a sign-up, from the precompiled catalog.
  test('gives the calendar file and the share menu their text in Swedish', async ({ page }) => {
    // Headless Chromium has no share menu: this one keeps what it was given.
    await page.addInitScript(() => {
      const shared: ShareData[] = [];
      Object.assign(window, { shared });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => {
          shared.push(data);
        },
      });
    });
    // The server's answer is stood in for, so the counts and the room left
    // that other tests read on this slot stay as seeded.
    const editUrl = `https://example.test/s/${slug}/c/com_e2e?token=e2e`;
    await page.route('**/api/slots/*/commitments', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { commitment: { id: 'com_e2e' }, editUrl } }),
      }),
    );
    await gotoSwedish(page, `/s/${slug}`);
    const dialog = swedish('participant.dialog');
    const fields = swedish('participant.fields');
    await page
      .locator('li')
      .filter({ hasText: slots.many })
      .getByRole('button', { name: /^Anmäl dig till / })
      .click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel(fields('name')).fill('Kim Exempel');
    await sheet.getByLabel(fields('emailOptional')).fill('kim@example.test');
    await sheet.getByRole('button', { name: dialog('confirm') }).click();
    await expect(sheet.getByRole('heading', { name: dialog('youreIn') })).toBeVisible();
    await shot(page, 'sheet-saved-emailed', { sheet: true });
    // The slot's full name, which "Vi har sparat din anmälan till …" shows first.
    const slotName = await sheet.locator('p strong').first().textContent();
    expect(slotName).toContain(slots.many);

    const downloading = page.waitForEvent('download');
    await sheet.getByRole('button', { name: dialog('addToCalendar') }).click();
    const download = await downloading;
    // Named in the slot's own letters, as Chromium saves it.
    expect(download.suggestedFilename()).toBe(`${slug}-${slots.many}.ics`);
    const ics = await readFile((await download.path())!, 'utf8');
    // Unfolded (RFC 5545 §3.1).
    expect(ics.replace(/\r\n /g, '').split('\r\n')).toContain(
      `DESCRIPTION:${dialog('calendarDescription', { url: editUrl })}`,
    );

    await sheet.getByRole('button', { name: dialog('saveYourLink') }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared))
      .toEqual([{ title, text: dialog('shareText', { slot: slotName! }), url: editUrl }]);
  });

  test('opens the sign-up sheet in Swedish, for a slot with a date and one without', async ({
    page,
  }) => {
    await gotoSwedish(page, `/s/${slug}`);
    const dialog = swedish('participant.dialog');
    const fields = swedish('participant.fields');
    const open = async (label: string) => {
      await page
        .locator('li')
        .filter({ hasText: label })
        .getByRole('button', { name: /^Anmäl dig till / })
        .click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByLabel(fields('name'))).toBeVisible();
      return sheet;
    };

    // A date and room for 20: the Spots box, the room left, and a reminder
    // in the email box's help.
    let sheet = await open(slots.many);
    await expect(sheet.getByLabel(fields('spots'))).toBeVisible();
    await expect(sheet).toContainText(dialog('emailHelp', { reminder: 'yes' }));
    await expectNoEnglish(sheet);
    await shot(page, 'sheet-dated', { sheet: true });

    // A mistyped address, and the one it may have meant.
    await sheet.getByLabel(fields('emailOptional')).fill('kim@gmial.com');
    await expect(sheet.getByRole('button', { name: 'kim@gmail.com' })).toBeVisible();
    await shot(page, 'sheet-did-you-mean', { sheet: true });
    await sheet.getByRole('button', { name: dialog('cancel') }).click();
    await expect(sheet).toBeHidden();

    // No date and no limit: no Spots box, and no reminder.
    sheet = await open(slots.unlimitedOne);
    await expect(sheet).toContainText(dialog('emailHelp', { reminder: 'no' }));
    await expectNoEnglish(sheet);
    await shot(page, 'sheet-undated', { sheet: true });
  });

  // Each answer the sheet has words for, stood in for, so the seed stays as
  // it is. The expected words come from the helper the sheet itself uses, in
  // Swedish, so a sheet that showed anything else would fail here.
  test('says why a sign-up didn’t go through, in Swedish, whatever the answer', async ({
    page,
  }) => {
    let answer: { status: number; body: object | string } | 'offline' = 'offline';
    await page.route('**/api/slots/*/commitments', (route) =>
      answer === 'offline'
        ? route.abort('internetdisconnected')
        : typeof answer.body === 'string'
          ? route.fulfill({ status: answer.status, contentType: 'text/html', body: answer.body })
          : route.fulfill({ status: answer.status, json: answer.body }),
    );
    await gotoSwedish(page, `/s/${slug}`);
    const dialog = swedish('participant.dialog');
    const fields = swedish('participant.fields');
    const errors = swedish('participant.errors');
    await page
      .locator('li')
      .filter({ hasText: slots.many })
      .getByRole('button', { name: /^Anmäl dig till / })
      .click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel(fields('name')).fill('Kim Exempel');
    await sheet.getByLabel(fields('emailOptional')).fill('kim@example.test');
    const confirm = sheet.getByRole('button', { name: dialog('confirm') });
    const alert = sheet.getByRole('alert');

    const refusals: [string, number, Parameters<typeof participantErrorCopy>[0]][] = [
      [
        'filled-up',
        409,
        {
          code: 'capacity_full',
          details: { remaining: 0, requested: 1, alternatives: [{ id: 'slot_x', title: 'Saft' }] },
        },
      ],
      ['only-one-left', 409, { code: 'capacity_full', details: { remaining: 1, requested: 2 } }],
      ['only-some-left', 409, { code: 'capacity_full', details: { remaining: 3, requested: 5 } }],
      ['closed', 409, { code: 'closed' }],
      ['gone', 404, { code: 'not_found' }],
      ['already-signed-up', 409, { code: 'conflict' }],
      ['rate-limited', 429, { code: 'rate_limited', details: { retryAfterSeconds: 60 } }],
      ['rate-limited-no-time', 429, { code: 'rate_limited' }],
      ['name', 400, { code: 'invalid_input', details: { reason: 'name_too_long' } }],
      ['notes', 400, { code: 'invalid_input', details: { reason: 'notes_too_long' } }],
      ['spots', 400, { code: 'invalid_input', details: { reason: 'quantity_too_large' } }],
      ['input', 400, { code: 'invalid_input' }],
      ['failed', 500, { code: 'internal' }],
      // Last: it makes the email box required from here on.
      ['email-required', 400, { code: 'invalid_input', details: { reason: 'email_required' } }],
    ];
    for (const [name, status, error] of refusals) {
      answer = { status, body: { error: { ...error, message: 'English, for API callers' } } };
      await confirm.click();
      const copy = participantErrorCopy(error, 'join', errors);
      await expect(alert).toContainText(copy.message);
      if (copy.suggestion) await expect(alert).toContainText(copy.suggestion);
      await expectNoEnglish(alert);
      await shot(page, `sheet-error-${name}`, { sheet: true });
    }

    // A proxy's error page, which may come after the sign-up was made.
    answer = { status: 502, body: '<html><body><h1>502 Bad Gateway</h1></body></html>' };
    await confirm.click();
    await expect(alert).toContainText(dialog('unreadable.message'));
    await expect(alert).toContainText(dialog('unreadable.suggestion'));
    await shot(page, 'sheet-error-unreadable', { sheet: true });

    // No answer at all.
    answer = 'offline';
    await confirm.click();
    await expect(alert).toContainText(dialog('unreachable.message'));
    await expect(alert).toContainText(dialog('unreachable.suggestion'));
    await shot(page, 'sheet-error-unreachable', { sheet: true });
  });

  test('says to save the link now when no email was given, in Swedish', async ({ page }) => {
    // Stood in for, as above.
    const editUrl = `https://example.test/s/${slug}/c/com_e2e?token=e2e`;
    await page.route('**/api/slots/*/commitments', (route) =>
      route.fulfill({ status: 201, json: { data: { commitment: { id: 'com_e2e' }, editUrl } } }),
    );
    await gotoSwedish(page, `/s/${slug}`);
    const dialog = swedish('participant.dialog');
    const fields = swedish('participant.fields');
    await page
      .locator('li')
      .filter({ hasText: slots.many })
      .getByRole('button', { name: /^Anmäl dig till / })
      .click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel(fields('name')).fill('Kim Exempel');
    await sheet.getByRole('button', { name: dialog('confirm') }).click();
    await expect(sheet.getByRole('heading', { name: dialog('youreIn') })).toBeVisible();
    const said = sheet.locator('p:has(strong)').first();
    const slotName = (await said.locator('strong').first().textContent()) ?? '';
    // The slot has a date, so the calendar file carries the link too.
    await expect(said).toHaveText(
      dialog.markup('savedNotEmailed', { slot: slotName, calendar: 'yes', b: plain }),
    );
    await shot(page, 'sheet-saved-not-emailed', { sheet: true });
  });

  test('shows a returning participant their spot, in Swedish', async ({ page, context }) => {
    await remember(context, remembered);
    await gotoSwedish(page, `/s/${slug}`);
    const view = swedish('participant.signupView');
    const main = page.locator('main');
    await expect(
      main
        .locator('li')
        .filter({ hasText: slots.many })
        .getByRole('link', { name: view('edit') }),
    ).toBeVisible();
    await expectNoEnglish(main);
    await shot(page, 'page-signed-up');
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
    await shot(page, 'edit-page');
  });

  test('asks before cancelling, in Swedish', async ({ page }) => {
    await gotoSwedish(page, editPath);
    await page.getByRole('button', { name: form('cancel') }).click();
    const question = page.getByRole('alertdialog', { name: form('confirmCancel') });
    await expect(question).toContainText(form('cancelQuestion'));
    await expect(question.getByRole('button', { name: form('yesCancel') })).toBeVisible();
    await expectNoEnglish(page.locator('main'));
    await shot(page, 'edit-cancel-question');
    // Kept: the seeded sign-up stays for the other specs.
    await question.getByRole('button', { name: form('keep') }).click();
    await expect(page.getByRole('button', { name: form('cancel') })).toBeVisible();
  });

  // The answers are faked, so the seeded sign-up stays as it is.
  test('says a save worked, or why not, in Swedish, down to 1 spot', async ({ page }) => {
    await gotoSwedish(page, editPath);
    // A string body is a page that isn't the API's JSON.
    let answer: { status: number; body: object | string } = { status: 200, body: { data: {} } };
    await page.route('**/api/commitments/**', (route) =>
      route.request().method() !== 'PATCH'
        ? route.continue()
        : typeof answer.body === 'string'
          ? route.fulfill({ status: answer.status, contentType: 'text/html', body: answer.body })
          : route.fulfill({ status: answer.status, json: answer.body }),
    );
    const main = page.locator('main');

    await main.getByRole('button', { name: form('save') }).click();
    await expect(main.getByRole('status')).toHaveText(form('saved'));
    await shot(page, 'edit-saved');

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
    await shot(page, 'edit-error-at-most-one');

    // The edit link's own rate limit, which this page used to show in the
    // server's English ("too many requests").
    answer = {
      status: 429,
      body: {
        error: {
          code: 'rate_limited',
          message: 'too many requests',
          details: { retryAfterSeconds: 120 },
        },
      },
    };
    await main.getByLabel(swedish('participant.fields')('spots')).fill('1');
    await main.getByRole('button', { name: form('save') }).click();
    await expect(main.getByRole('alert')).toHaveText(
      `${errors('rateLimit.message')} ${errors('rateLimit.wait', { minutes: 2 })}`,
    );
    await shot(page, 'edit-error-rate-limited');

    // And anything with no copy of its own.
    answer = {
      status: 500,
      body: { error: { code: 'internal', message: 'something went wrong' } },
    };
    await main.getByRole('button', { name: form('save') }).click();
    await expect(main.getByRole('alert')).toHaveText(
      `${errors('failed.save')} ${errors('failed.tryAgain')}`,
    );
    await expectNoEnglish(main);
    await shot(page, 'edit-error-failed');

    // A proxy's error page, which may come after the server saved: the form
    // doesn't say whether it did, only to save again.
    answer = { status: 502, body: '<html><body><h1>502 Bad Gateway</h1></body></html>' };
    await main.getByRole('button', { name: form('save') }).click();
    await expect(main.getByRole('alert')).toHaveText(form('saveUnreadable'));
    await expectNoEnglish(main);
    await shot(page, 'edit-error-unreadable');
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
    await shot(page, 'cancelled-page');
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
    await shot(page, 'edit-link-not-found');
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
    await shot(page, 'unsubscribe-confirm');

    await gotoSwedish(page, `${unsubscribePath}&done=on`);
    await expectPage(
      main,
      t('turnedOn.title'),
      t.markup('turnedOn.bodyWithEmail', { ...parts, email: editEmail }),
      [t('stop'), t('keep')],
    );
    await shot(page, 'unsubscribe-turned-on');

    await gotoSwedish(page, `${unsubscribePath}&error=off`);
    await expect(main.getByRole('alert')).toHaveText(t('turnOffFailed'));
    await shot(page, 'unsubscribe-turn-off-failed');
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
    await shot(page, 'unsubscribe-are-off');

    await gotoSwedish(page, `${optedOutUnsubscribePath}&done=off`);
    await expectPage(main, t('turnedOff.title'), t.markup('turnedOff.body', parts), [
      t('turnBackOn'),
      t('back'),
    ]);
    await shot(page, 'unsubscribe-turned-off');

    await gotoSwedish(page, `${optedOutUnsubscribePath}&error=on`);
    await expect(main.getByRole('alert')).toHaveText(t('turnOnFailed'));
    await shot(page, 'unsubscribe-turn-on-failed');
  });

  test('explains a link it can’t use, in the Swedish signup’s language', async ({ page }) => {
    const main = page.locator('main');
    await gotoSwedish(page, `/s/${slug}/unsubscribe`);
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(t('incomplete.title'));
    await expect(main).toContainText(t('incomplete.body'));
    await expectNoEnglish(main);
    await shot(page, 'unsubscribe-incomplete-link');

    await gotoSwedish(page, badToken(unsubscribePath));
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(t('invalid.title'));
    await expect(main).toContainText(t('invalid.body'));
    await expectNoEnglish(main);
    await shot(page, 'unsubscribe-invalid-link');
  });
});

// A signup that isn't open shows its own page: the seed's Swedish draft,
// and a closed and an archived signup in Swedish (makeSwedishClosedAndArchived
// in tests/e2e/helpers/seed.ts).
test.describe('a Swedish signup that isn’t open', () => {
  const signupPage = swedish('participant.signupPage');
  const view = swedish('participant.signupView');
  const closed = seed.swedishClosed;

  test('says a draft isn’t ready yet, in Swedish', async ({ page }) => {
    await gotoSwedish(page, `/s/${seed.swedishBuild.slug}`);
    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(signupPage('draft.title'));
    await expect(main).toContainText(signupPage('draft.body'));
    await expectNoEnglish(main);
    await shot(page, 'page-draft');
  });

  test('says an archived signup is gone, in Swedish', async ({ page }) => {
    await gotoSwedish(page, `/s/${seed.swedishArchived.slug}`);
    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(signupPage('archived.title'));
    await expect(main).toContainText(signupPage('archived.body'));
    await expectNoEnglish(main);
    await shot(page, 'page-archived');
  });

  test('says a signup has closed, in Swedish, and that your spot is still yours', async ({
    page,
    context,
  }) => {
    await gotoSwedish(page, `/s/${closed.slug}`);
    const main = page.locator('main');
    await expect(main).toContainText(view('closedBanner.title'));
    await expect(main).toContainText(view('closedBanner.body'));
    await expectNoEnglish(main);
    await shot(page, 'page-closed');

    await remember(context, closed.remembered);
    await gotoSwedish(page, `/s/${closed.slug}`);
    await expect(main).toContainText(view('closedBanner.keepsYours', { count: 1 }));
    await expectNoEnglish(main);
    await shot(page, 'page-closed-yours');
  });

  test('says on its edit page that it has closed, in Swedish', async ({ page }) => {
    await gotoSwedish(page, closed.editPath);
    const editPage = swedish('participant.editPage');
    const main = page.locator('main');
    await expect(main).toContainText(editPage('closedBanner.title'));
    await expect(main).toContainText(editPage('closedBanner.body'));
    await expectNoEnglish(main);
    await shot(page, 'edit-page-closed');

    await gotoSwedish(page, closed.cancelledEditPath);
    const cancelled = swedish('participant.cancelledPage');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(cancelled('title'));
    await expect(main).toContainText(cancelled('signupClosed'));
    await expectNoEnglish(main);
    await shot(page, 'cancelled-page-signup-closed');
  });
});
