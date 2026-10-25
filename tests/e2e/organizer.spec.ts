import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { BASE_URL, loadSeed } from './helpers/fixtures';
import { createClosedSignup, createDraft, createPublishedSignup } from './helpers/signups';

const seed = loadSeed();

test.describe('organizer flow', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  test('dashboard lists workspace signups', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('heading', { name: 'Your signups' })).toBeVisible();
    await expect(page.getByText(seed.publicTitle)).toBeVisible();
    await expect(page.getByText(seed.draftTitle)).toBeVisible();
  });

  test('organizer publishes a draft signup', async ({ page }) => {
    // Create a fresh draft via the API (session cookie carries auth) so the
    // test owns its state — projects and retries never compete over one draft.
    // Its slot says what it is, so Publish's check has nothing to stop.
    const { id: draftId } = await createDraft(page.request, {
      title: `Publish flow ${Date.now()}`,
      values: { what: 'Juice', date: '2030-04-06' },
    });

    await page.goto(`/app/signups/${draftId}/build`);
    // At the top on a computer, in the bar at the bottom on a phone: the one
    // on screen.
    await page.getByRole('button', { name: 'Publish and share', exact: true }).click();
    // It stays on the tab and opens the share panel, a sheet on a phone.
    await expect(page.getByRole('dialog', { name: 'Now send people the link' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/app/signups/${draftId}/build$`));
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Copy link' })).toBeVisible();
  });

  test('Close signup asks first, and Not yet leaves the signup open', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const signup = await createPublishedSignup(page.request, {
      title: `Close flow ${Date.now()}`,
      slot: { values: { what: 'Juice', date: '2030-04-06' }, capacity: 5 },
    });
    const storedStatus = async () =>
      (await (await page.request.get(`/api/signups/${signup.id}`)).json()).data.status;
    const pill = (status: string) =>
      page.getByText(status, { exact: true }).locator('visible=true');
    const banner = page.getByText('Signup closed', { exact: true });

    await page.goto(`/app/signups/${signup.id}/build`);
    const more = page.getByRole('button', { name: 'More actions' });
    const panel = page.getByRole('dialog', { name: 'More actions' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await panel.getByRole('button', { name: 'Close signup' }).click();
    await expect(panel).toContainText(
      'Nobody has signed up yet. People can’t sign up until you reopen it.',
    );
    const notYet = panel.getByRole('button', { name: 'Not yet' });
    await expect(notYet).toBeFocused();
    await notYet.click();
    await expect(panel).toBeHidden();
    await expect(more).toBeFocused();
    await expect(pill('open')).toBeVisible();
    await expect(banner).toHaveCount(0);
    expect(await storedStatus()).toBe('open');

    // Someone signs up meanwhile. The question counts them, though the page
    // hasn't reloaded.
    const slots = (await (await page.request.get(`/api/signups/${signup.id}/slots`)).json())
      .data as { id: string; values: { what?: string } }[];
    const juice = slots.find((slot) => slot.values.what === 'Juice');
    const signedUp = await page.request.post(`/api/slots/${juice?.id}/commitments`, {
      headers: { 'x-forwarded-for': '203.0.113.78' },
      data: { name: 'Sam Example', email: `sam+${Date.now()}@example.test`, quantity: 1 },
    });
    expect(signedUp.ok()).toBe(true);

    await more.click();
    await panel.getByRole('button', { name: 'Close signup' }).click();
    // The signup's empty first slot and Juice: 1 + 5 spots, 1 taken.
    await expect(panel).toContainText('5 of 6 spots are still open.');
    // Someone has signed up, so it says what happens to them.
    await expect(panel).toContainText('Everyone already signed up keeps their spot.');
    await panel.getByRole('button', { name: 'Close signup' }).click();
    await expect(pill('closed')).toBeVisible();
    await expect(banner).toBeVisible();
    await expect(
      page.getByText('People can’t sign up now. Everyone already signed up keeps their spot.'),
    ).toBeVisible();
    expect(await storedStatus()).toBe('closed');
    // The ⋯ went with it, so focus is on the title, and a screen reader hears
    // what happened.
    await expect(more).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(
      page.getByRole('status').filter({ hasText: 'Closed. People can’t sign up now.' }),
    ).toHaveCount(1);

    // The box stays on the other tabs, and goes for good with its ✕, which
    // gives focus to the title. The header still says it's closed, and the
    // next page load shows no box.
    await page.getByRole('tab', { name: /^Settings/ }).click();
    await page.waitForURL(/\/settings$/);
    await expect(banner).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(pill('closed')).toBeVisible();
    await page.reload();
    await expect(pill('closed')).toBeVisible();
    await expect(
      page.getByText('Closed · 1 of 6 spots taken').locator('visible=true'),
    ).toBeVisible();
    await expect(banner).toHaveCount(0);
  });

  test('on a phone, Close signup asks first in the More actions sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const title = `Close on a phone ${Date.now()}`;
    const signup = await createPublishedSignup(page.request, {
      title,
      slot: { values: { what: 'Juice', date: '2030-04-06' }, capacity: 5 },
    });
    const storedStatus = async () =>
      (await (await page.request.get(`/api/signups/${signup.id}`)).json()).data.status;

    await page.goto(`/app/signups/${signup.id}/build`);
    const more = page.getByRole('button', { name: 'More actions' });
    const sheet = page.getByRole('dialog', { name: title });
    await more.click();
    await sheet.getByRole('button', { name: 'Close signup' }).click();
    await expect(
      sheet.getByRole('group', { name: /^Nobody has signed up yet\. People can’t sign up/ }),
    ).toBeVisible();
    const notYet = sheet.getByRole('button', { name: 'Not yet' });
    await expect(notYet).toBeFocused();
    for (const name of ['Not yet', 'Close signup']) {
      const box = await sheet.getByRole('button', { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await notYet.click();
    await expect(sheet).toBeHidden();
    expect(await storedStatus()).toBe('open');

    await more.click();
    await sheet.getByRole('button', { name: 'Close signup' }).click();
    await sheet.getByRole('button', { name: 'Close signup' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('closed', { exact: true }).locator('visible=true')).toBeVisible();
    await expect(page.getByText('Signup closed', { exact: true })).toBeVisible();
    expect(await storedStatus()).toBe('closed');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

    // ⋯ stays, now with Reopen signup in place of Close's question. Reopened
    // from it, the signup is open again and the sheet shuts.
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(sheet.getByRole('button', { name: 'Not yet' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Close signup' })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Reopen signup' }).click();
    await expect(page.getByText('open', { exact: true }).locator('visible=true')).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(sheet).toBeHidden();
    expect(await storedStatus()).toBe('open');

    // Opened again, the sheet starts from its menu, not Close's question.
    await more.click();
    await expect(sheet.getByRole('link', { name: 'Preview' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Close signup' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Not yet' })).toHaveCount(0);
  });

  test('a signup closed some other way shows as closed, without the announcement or the box', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const signup = await createPublishedSignup(page.request, {
      title: `Closed elsewhere ${Date.now()}`,
      slot: { values: { what: 'Juice', date: '2030-04-06' }, capacity: 5 },
    });
    await page.goto(`/app/signups/${signup.id}/settings`);
    await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible();

    // As another tab or an AI assistant would, then a save on this page
    // brings the header up to date.
    expect((await page.request.post(`/api/signups/${signup.id}/close`)).ok()).toBe(true);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reopen signup' })).toBeVisible();
    await expect(page.getByText('Signup closed', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'Closed. People can’t sign up now.' }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).not.toBeFocused();
  });

  test('Close, then Reopen, doesn’t put Reopen under the confirm’s button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const signup = await createPublishedSignup(page.request, {
      title: `Close then reopen ${Date.now()}`,
      slot: { values: { what: 'Juice', date: '2030-04-06' }, capacity: 5 },
    });
    await page.goto(`/app/signups/${signup.id}/build`);
    const panel = page.getByRole('dialog', { name: 'More actions' });
    await page.getByRole('button', { name: 'More actions' }).click();
    await panel.getByRole('button', { name: 'Close signup' }).click();
    const confirm = panel.getByRole('group').getByRole('button', { name: 'Close signup' });
    await expect(confirm).toBeVisible();
    // Read before pressing it: the panel goes once the signup closes.
    const confirmBox = await confirm.boundingBox();
    await confirm.click();
    const reopen = page.getByRole('button', { name: 'Reopen signup' });
    await expect(reopen).toBeVisible();
    const reopenBox = await reopen.boundingBox();
    if (!confirmBox || !reopenBox) throw new Error('both buttons should have been on screen');

    // Reopen takes the header's row, at its right where Share and the ⋯
    // were, and the panel hung below the ⋯, so its red button was under the
    // header: a second click on it lands below Reopen, not on it.
    expect(reopenBox.y + reopenBox.height).toBeLessThanOrEqual(confirmBox.y);
    const overlap =
      reopenBox.x < confirmBox.x + confirmBox.width &&
      confirmBox.x < reopenBox.x + reopenBox.width &&
      reopenBox.y < confirmBox.y + confirmBox.height &&
      confirmBox.y < reopenBox.y + reopenBox.height;
    expect(overlap).toBe(false);
  });

  test('the slot editor takes no date before 1900', async ({ page }) => {
    // A fresh signup per run. createSignup applies DEFAULT_TEMPLATE: fields
    // `what` (text) and `date`.
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Date floor ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const signupId = (await created.json()).data.id as string;
    const added = await page.request.post(`/api/signups/${signupId}/slots`, {
      data: { capacity: 1, values: { what: 'Juice', date: '2030-04-06' } },
    });
    expect(added.ok()).toBe(true);
    const slotId = (await added.json()).data.id as string;

    async function storedDate() {
      const res = await page.request.get(`/api/signups/${signupId}/slots`);
      expect(res.ok()).toBe(true);
      const rows = (await res.json()).data as { id: string; values: { date?: string } }[];
      return rows.find((r) => r.id === slotId)?.values.date;
    }
    const slotSaved = () =>
      page.waitForResponse(
        (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/slots/${slotId}`),
      );

    await page.goto(`/app/signups/${signupId}/build`);
    await page.getByRole('button', { name: /Edit slot .*Juice/ }).click();
    const date = page.getByLabel('Date value');
    // The picker starts where the services do.
    await expect(date).toHaveAttribute('min', '1900-01-01');

    // An earlier date is out of the picker's range, and the save says why it
    // was refused.
    let saved = slotSaved();
    await date.fill('1899-12-31');
    expect(await date.evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow)).toBe(true);
    expect((await saved).status()).toBe(400);
    await expect(page.getByText('"date" must be a date in 1900 or later')).toBeVisible();
    expect(await storedDate()).toBe('2030-04-06');

    // The first day of 1900 is in range and saves.
    saved = slotSaved();
    await date.fill('1900-01-01');
    expect(await date.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(true);
    expect((await saved).ok()).toBe(true);
    expect(await storedDate()).toBe('1900-01-01');
  });

  test('the Settings tab makes the email optional, and required again', async ({
    page,
    browser,
  }) => {
    const signup = await createPublishedSignup(page.request, {
      title: `Email setting ${Date.now()}`,
      slot: { values: { what: 'Juice', date: '2030-04-06' }, capacity: 5 },
    });
    const storedRequireEmail = async () => {
      const res = await page.request.get(`/api/signups/${signup.id}`);
      return (await res.json()).data.settings.requireEmail as boolean;
    };
    // The public form in a fresh browser each time, as a participant sees it.
    const openForm = async () => {
      const visitor = await browser.newPage();
      await visitor.goto(`/s/${signup.slug}`);
      await visitor.getByRole('button', { name: /^Sign up for Juice/ }).click();
      await expect(visitor.getByLabel('Your name')).toBeVisible();
      return visitor;
    };

    const settings = `/app/signups/${signup.id}/settings`;
    await page.goto(settings);
    // The header has a live region of its own.
    const saved = page.getByRole('region', { name: 'Sign-up form' }).getByRole('status');
    const required = page.getByRole('radio', { name: 'Required' });
    const optional = page.getByRole('radio', { name: 'Optional' });
    await expect(required).toBeChecked();
    // Only the line for the choice picked shows, and it follows the radio
    // before a save. Each radio is described by its own line.
    const requiredHelp = page.getByText('We email everyone their link');
    const optionalHelp = page.getByText('People can leave it blank.');
    await expect(requiredHelp).toBeVisible();
    await expect(optionalHelp).toBeHidden();
    await expect(required).toHaveAccessibleDescription(/We email everyone their link/);
    await expect(optional).toHaveAccessibleDescription(/People can leave it blank\./);

    await optional.check();
    await expect(optionalHelp).toBeVisible();
    await expect(requiredHelp).toBeHidden();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(saved).toHaveText('Saved');
    expect(await storedRequireEmail()).toBe(false);
    await page.reload();
    await expect(optional).toBeChecked();

    let visitor = await openForm();
    await expect(visitor.getByLabel('Email (optional)')).toHaveJSProperty('required', false);
    await visitor.getByLabel('Your name').fill('Sam Example');
    await visitor.getByRole('button', { name: 'Confirm' }).click();
    await expect(visitor.getByRole('heading', { name: "You're in." })).toBeVisible();
    await visitor.close();

    await page.goto(settings);
    await required.check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(saved).toHaveText('Saved');
    expect(await storedRequireEmail()).toBe(true);
    await expect(required).toBeChecked();

    visitor = await openForm();
    await expect(visitor.getByLabel('Email', { exact: true })).toHaveJSProperty('required', true);
    await expect(visitor.getByLabel('Email (optional)')).toHaveCount(0);
    await visitor.close();
  });

  test('unauthenticated visitor is redirected to login', async ({ browser }) => {
    const anonContext = await browser.newContext();
    const page = await anonContext.newPage();
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
    await anonContext.close();
  });
});

/**
 * Reopen signup on a closed signup's page: beside Preview on a computer, or
 * on a phone in the More actions sheet, which this opens.
 */
async function reopenSignup(page: Page, device: 'a computer' | 'a phone'): Promise<Locator> {
  if (device === 'a computer') return page.getByRole('button', { name: 'Reopen signup' });
  await page.getByRole('button', { name: 'More actions' }).click();
  return page.getByRole('dialog').getByRole('button', { name: 'Reopen signup' });
}

// Reopen signup, at a computer's size, beside Preview, and a phone's, in the
// ⋯ sheet.
for (const [device, viewport] of [
  ['a computer', { width: 1280, height: 900 }],
  ['a phone', { width: 390, height: 844 }],
] as const) {
  test.describe(`Reopen signup on ${device}`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ context }) => {
      await loginAsSeededOrganizer(context);
    });

    test('Reopen signup opens a closed signup again', async ({ page }) => {
      const signup = await createClosedSignup(page.request, {
        title: `Reopen flow ${Date.now()}`,
        slot: { values: { what: 'Juice', date: '2030-04-06' }, capacity: 5 },
      });
      const storedStatus = async () =>
        (await (await page.request.get(`/api/signups/${signup.id}`)).json()).data.status;
      const pill = (status: string) =>
        page.getByText(status, { exact: true }).locator('visible=true');
      const banner = page.getByText('Signup closed', { exact: true });

      await page.goto(`/app/signups/${signup.id}/build`);
      await expect(pill('closed')).toBeVisible();
      // Closed before the page loaded, so no box: the header says it.
      await expect(banner).toHaveCount(0);
      const reopen = await reopenSignup(page, device);
      await expect(reopen).toBeVisible();
      if (device === 'a phone') {
        const box = await reopen.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      } else {
        // Beside Preview, where a draft has Publish and share.
        const preview = page.getByRole('link', { name: 'Preview' }).locator('visible=true');
        const [previewBox, reopenBox] = await Promise.all([
          preview.boundingBox(),
          reopen.boundingBox(),
        ]);
        if (!previewBox || !reopenBox) throw new Error('Preview and Reopen should be on screen');
        const gap = reopenBox.x - (previewBox.x + previewBox.width);
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThan(16);
        expect(Math.abs(reopenBox.y - previewBox.y)).toBeLessThan(2);
      }
      await reopen.click();

      await expect(banner).toHaveCount(0);
      await expect(reopen).toHaveCount(0);
      await expect(pill('open')).toBeVisible();
      // The button went once the signup opened, so focus is on the title,
      // and a screen reader hears what happened.
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
      await expect(
        page.getByRole('status').filter({ hasText: 'Reopened. People can sign up again.' }),
      ).toHaveCount(1);
      expect(await storedStatus()).toBe('open');

      // People can sign up again.
      await page.goto(`/s/${signup.slug}`);
      await expect(page.getByRole('button', { name: /^Sign up for Juice/ })).toBeEnabled();
    });

    test('a refused Reopen signup keeps the keyboard on the button', async ({ page }) => {
      const signup = await createClosedSignup(page.request, {
        title: `Reopen refused ${Date.now()}`,
        slot: { values: { what: 'Juice', date: '2030-04-06' }, capacity: 5 },
      });
      await page.goto(`/app/signups/${signup.id}/build`);
      const reopen = await reopenSignup(page, device);
      await expect(reopen).toBeVisible();

      // Reopened somewhere else meanwhile, so this page's press is refused.
      expect((await page.request.post(`/api/signups/${signup.id}/reopen`)).ok()).toBe(true);
      await reopen.focus();
      await page.keyboard.press('Enter');

      await expect(
        page.getByText('This signup changed since the page loaded. Reload to see the latest.'),
      ).toBeVisible();
      // The button was disabled while the press was in flight, which takes
      // focus off it in a browser; the refusal gives it back.
      await expect(reopen).toBeFocused();
    });
  });
}

// Publish checks the page first (#503), at a computer's size and a phone's:
// the header's popover, or a sheet over the bar at the bottom of the screen.
for (const [device, viewport] of [
  ['a computer', { width: 1280, height: 900 }],
  ['a phone', { width: 390, height: 844 }],
] as const) {
  test.describe(`Publish’s check on ${device}`, () => {
    test.use({ viewport });
    test.beforeEach(async ({ context }) => {
      await loginAsSeededOrganizer(context);
    });

    // At the top on a computer, in the bar on a phone: the one on screen.
    const publishButton = (page: Page) =>
      page.getByRole('button', { name: 'Publish and share', exact: true });
    const storedStatus = async (page: Page, id: string) =>
      (await (await page.request.get(`/api/signups/${id}`)).json()).data.status;
    // What the header's live region says once Publish and share has the focus back.
    const ready = (page: Page) =>
      page.getByRole('status').filter({ hasText: 'Publish and share when you’re ready.' });

    test('an empty slot stops Publish, and Fill it in opens it', async ({ page }) => {
      const draft = await createDraft(page.request, { title: `Empty slot ${Date.now()}` });
      await page.goto(`/app/signups/${draft.id}/build`);
      const publish = publishButton(page);
      await publish.click();
      const check = page.getByRole('dialog', { name: 'Nothing to sign up for yet' });
      await expect(check).toBeVisible();
      await expect(check).toContainText(
        'The slot is empty. Say what people sign up for, then publish.',
      );
      await expect(check.getByRole('button', { name: 'Fill it in' })).toBeFocused();
      expect(await storedStatus(page, draft.id)).toBe('draft');

      // Escape puts focus back on Publish and share.
      await page.keyboard.press('Escape');
      await expect(check).toBeHidden();
      await expect(publish).toBeFocused();

      await publish.click();
      await check.getByRole('button', { name: 'Fill it in' }).click();
      await expect(check).toBeHidden();
      const editor = page.getByTestId(`slot-editor-${draft.slotId}`);
      await expect(editor.getByRole('textbox', { name: 'What value' })).toBeFocused();
      expect(await storedStatus(page, draft.id)).toBe('draft');
    });

    test('a slot that says TBD warns, from another tab too, and Publish anyway publishes', async ({
      page,
    }) => {
      const draft = await createDraft(page.request, {
        title: `Still TBD ${Date.now()}`,
        values: { what: 'Cashier TBD', date: '2030-04-06' },
      });
      await page.goto(`/app/signups/${draft.id}/responses`);
      const publish = publishButton(page);
      await publish.click();
      const check = page.getByRole('dialog', { name: 'Before people see it' });
      await expect(check).toContainText('Cashier TBD · Sat, Apr 6 still says “TBD”.');
      expect(await storedStatus(page, draft.id)).toBe('draft');

      // Name it first goes to Build, with that slot open and focus on the TBD.
      await check.getByRole('button', { name: 'Name it first' }).click();
      await expect(page).toHaveURL(new RegExp(`/app/signups/${draft.id}/build$`));
      const what = page
        .getByTestId(`slot-editor-${draft.slotId}`)
        .getByRole('textbox', { name: 'What value' });
      await expect(what).toBeFocused();
      await expect(what).toHaveValue('Cashier TBD');

      // Publish anyway publishes it as it is, and the share panel opens.
      await publish.click();
      await check.getByRole('button', { name: 'Publish anyway' }).click();
      await expect(page.getByRole('dialog', { name: 'Now send people the link' })).toBeVisible();
      expect(await storedStatus(page, draft.id)).toBe('open');

      // With no Publish and share left to go back to, Enter in the slot's box
      // leaves it open, and Done closes it, saying nothing. The slot's mark
      // now says people can see it.
      await page.keyboard.press('Escape');
      await what.press('Enter');
      await expect(what).toBeFocused();
      await page
        .getByTestId(`slot-editor-${draft.slotId}`)
        .getByRole('button', { name: 'Done' })
        .click();
      await expect(
        page.getByRole('button', { name: 'Edit slot — Cashier TBD, people can see “TBD”' }),
      ).toBeVisible();
      await expect(page.getByText('People can see “TBD”', { exact: true })).toBeVisible();
      await expect(ready(page)).toHaveCount(0);
    });

    test('a slot that says TBD is marked, and Enter after Name it first goes back to Publish and share', async ({
      page,
    }) => {
      const draft = await createDraft(page.request, {
        title: `Marked TBD ${Date.now()}`,
        values: { what: 'Cashier TBD', date: '2030-04-06' },
      });
      await page.goto(`/app/signups/${draft.id}/build`);
      const slot = page.getByTestId(`wysiwyg-slot-${draft.slotId}`);
      const mark = slot.getByText('Still says “TBD”', { exact: true });
      await expect(mark).toBeVisible();
      await expect(
        slot.getByRole('button', { name: 'Edit slot — Cashier TBD, still says “TBD”' }),
      ).toBeVisible();

      const publish = publishButton(page);
      await publish.click();
      await page
        .getByRole('dialog', { name: 'Before people see it' })
        .getByRole('button', { name: 'Name it first' })
        .click();
      const editor = page.getByTestId(`slot-editor-${draft.slotId}`);
      const what = editor.getByRole('textbox', { name: 'What value' });
      await expect(what).toBeFocused();
      await what.fill('Cashier');
      // Enter in the box does what Done does, in a slot the check opened.
      await what.press('Enter');
      await expect(editor).toHaveCount(0);

      // Focus is back on Publish and share, ringed for a moment (as after a
      // click on Done, where no focus ring would show), and the header says
      // it can be published. The mark has gone with the TBD, before the edit
      // has saved.
      await expect(publish).toBeFocused();
      await expect(publish).toHaveCSS('outline-offset', '3px');
      await expect(ready(page)).toHaveCount(1);
      await expect(mark).toHaveCount(0);
      await expect(slot.getByRole('button', { name: 'Edit slot — Cashier' })).toBeVisible();
      await expect(publish).not.toHaveCSS('outline-offset', '3px');
      await expect(publish).toBeFocused();

      // Enter publishes from there, with the edit saved first.
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Now send people the link' })).toBeVisible();
      expect(await storedStatus(page, draft.id)).toBe('open');
    });

    test('Enter or Done after opening a slot by hand doesn’t move focus to Publish and share', async ({
      page,
    }) => {
      const draft = await createDraft(page.request, {
        title: `Opened by hand ${Date.now()}`,
        values: { what: 'Cashier TBD', date: '2030-04-06' },
      });
      await page.goto(`/app/signups/${draft.id}/build`);
      await page.getByRole('button', { name: /^Edit slot — Cashier TBD/ }).click();
      const editor = page.getByTestId(`slot-editor-${draft.slotId}`);
      // Enter does nothing new in a slot opened by hand.
      await editor.getByRole('textbox', { name: 'What value' }).press('Enter');
      await expect(editor).toBeVisible();
      await expect(editor.getByRole('textbox', { name: 'What value' })).toBeFocused();
      await editor.getByRole('button', { name: 'Done' }).click();
      await expect(publishButton(page)).not.toBeFocused();
      await expect(ready(page)).toHaveCount(0);
    });
  });
}

// A slot still saying TBD is marked on the Build tab. On a phone the tag
// has a line of its own, under the slot's values: beside them it ran over
// the spots count and left the values no room.
test.describe('the TBD mark on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('sits clear of the spots count, and the slot’s values still show', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    const signup = await createPublishedSignup(page.request, {
      title: `Mark on a phone ${Date.now()}`,
      slot: { values: { what: 'Bake stall: TBD', date: '2030-04-06' }, capacity: 3 },
    });
    await page.goto(`/app/signups/${signup.id}/build`);
    const row = page.getByRole('button', {
      name: 'Edit slot — Bake stall: TBD, people can see “TBD”',
    });
    const tag = row.getByText('People can see “TBD”', { exact: true });
    const anchor = row.getByText('Bake stall: TBD', { exact: true });
    const summary = row.getByText(/^Sat, Apr 6/);
    const count = row.getByText('0 of 3 taken', { exact: true });
    for (const part of [tag, anchor, summary, count]) await expect(part).toBeVisible();

    const [t, a, s, c] = await Promise.all(
      [tag, anchor, summary, count].map((l) => l.boundingBox()),
    );
    if (!t || !a || !s || !c) throw new Error('a part of the row is not on screen');
    // Nothing runs over the count: toBeVisible() alone passes on an overlap.
    for (const box of [t, a, s]) expect(box.x + box.width).toBeLessThanOrEqual(c.x);
    // The tag is under the values, and they aren't cut short.
    expect(t.y).toBeGreaterThanOrEqual(a.y + a.height);
    for (const part of [anchor, summary]) {
      expect(await part.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
  });
});

// On a computer the tag follows the slot's values, and drops under them
// when a long name leaves no room, rather than squeeze the summary away.
test.describe('the TBD mark on a computer', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('drops under a long name, keeping the date beside it whole', async ({ page, context }) => {
    await loginAsSeededOrganizer(context);
    const signup = await createPublishedSignup(page.request, {
      title: `Long mark ${Date.now()}`,
      slot: {
        values: { what: 'Cashier for the whole long afternoon shift TBD', date: '2030-04-06' },
        capacity: 3,
      },
    });
    await page.goto(`/app/signups/${signup.id}/build`);
    const row = page.getByRole('button', { name: /people can see “TBD”$/ });
    const tag = row.getByText('People can see “TBD”', { exact: true });
    const anchor = row.getByText(/^Cashier for the whole/);
    const summary = row.getByText(/^Sat, Apr 6/);
    const count = row.getByText('0 of 3 taken', { exact: true });
    for (const part of [tag, anchor, summary, count]) await expect(part).toBeVisible();

    const [t, a, s, c] = await Promise.all(
      [tag, anchor, summary, count].map((l) => l.boundingBox()),
    );
    if (!t || !a || !s || !c) throw new Error('a part of the row is not on screen');
    for (const box of [t, a, s]) expect(box.x + box.width).toBeLessThanOrEqual(c.x);
    // The date keeps its 10ch and isn't cut short; the tag went under.
    const tenCh = await summary.evaluate((el) => parseFloat(getComputedStyle(el).minWidth));
    expect(tenCh).toBeGreaterThan(0);
    expect(s.width).toBeGreaterThanOrEqual(tenCh - 0.5);
    expect(await summary.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(t.y).toBeGreaterThanOrEqual(a.y + a.height);
  });

  test('follows a short slot’s values, not the count', async ({ page, context }) => {
    await loginAsSeededOrganizer(context);
    const signup = await createPublishedSignup(page.request, {
      title: `Short mark ${Date.now()}`,
      slot: { values: { what: 'Juice TBD', date: '2030-04-06' }, capacity: 3 },
    });
    await page.goto(`/app/signups/${signup.id}/build`);
    const row = page.getByRole('button', { name: 'Edit slot — Juice TBD, people can see “TBD”' });
    const tag = row.getByText('People can see “TBD”', { exact: true });
    const summary = row.getByText(/^Sat, Apr 6/);
    const count = row.getByText('0 of 3 taken', { exact: true });
    for (const part of [tag, summary, count]) await expect(part).toBeVisible();

    const [t, s, c] = await Promise.all([tag, summary, count].map((l) => l.boundingBox()));
    if (!t || !s || !c) throw new Error('a part of the row is not on screen');
    // On the same line, right after the date (the 10px gap), and well clear
    // of the count rather than pushed against it.
    expect(Math.abs(t.y + t.height / 2 - (s.y + s.height / 2))).toBeLessThan(4);
    expect(t.x - (s.x + s.width)).toBeGreaterThanOrEqual(0);
    expect(t.x - (s.x + s.width)).toBeLessThanOrEqual(14);
    expect(c.x - (t.x + t.width)).toBeGreaterThan(40);
  });
});

// What Publish waits for and where its fix goes, at a computer's size.
test.describe('Publish’s check, around the Build tab', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  const publishButton = (page: Page) =>
    page.getByRole('button', { name: 'Publish and share', exact: true });
  const storedStatus = async (page: Page, id: string) =>
    (await (await page.request.get(`/api/signups/${id}`)).json()).data.status;
  const storedSlots = async (page: Page, id: string) =>
    (await (await page.request.get(`/api/signups/${id}/slots`)).json()).data as {
      id: string;
      values: Record<string, unknown>;
    }[];

  test('Add a slot from another tab opens one on Build, and Back and Forward add no more', async ({
    page,
  }) => {
    const draft = await createDraft(page.request, { title: `No slots ${Date.now()}` });
    expect((await page.request.delete(`/api/slots/${draft.slotId}`)).ok()).toBe(true);

    await page.goto(`/app/signups/${draft.id}/settings`);
    await publishButton(page).click();
    const check = page.getByRole('dialog', { name: 'Nothing to sign up for yet' });
    await expect(check).toContainText('There are no slots yet. Add one, then publish.');
    await check.getByRole('button', { name: 'Add a slot' }).click();
    // The address is Build's own: the slot to open never goes in it.
    await expect(page).toHaveURL(new RegExp(`/app/signups/${draft.id}/build$`));
    const editor = page.locator('[data-testid^="slot-editor-"]');
    await expect(editor.getByRole('textbox', { name: 'What value' })).toBeFocused();
    expect(await storedSlots(page, draft.id)).toHaveLength(1);

    // Back and Forward bring Build back without adding a slot. (What Build
    // then shows is the router's copy from the first visit: Next keeps it for
    // Back and Forward, and Build's own saves don't refresh it.)
    const added: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(`/api/signups/${draft.id}/slots`)) {
        added.push(r.url());
      }
    });
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/app/signups/${draft.id}/settings$`));
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/app/signups/${draft.id}/build$`));
    await expect(page.getByRole('button', { name: 'Signup title' })).toBeVisible();
    expect(added).toEqual([]);
    expect(await storedSlots(page, draft.id)).toHaveLength(1);
  });

  test('a change that didn’t save stops Publish, and says so', async ({ page }) => {
    const draft = await createDraft(page.request, {
      title: `Unsaved ${Date.now()}`,
      values: { what: 'Juice', date: '2030-04-06' },
    });
    await page.goto(`/app/signups/${draft.id}/build`);
    await page.getByRole('button', { name: /^Edit slot .*Juice/ }).click();
    // The server refuses every slot save from here on.
    await page.route(`**/api/slots/${draft.slotId}`, (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'internal', message: 'Down for a moment' } }),
          })
        : route.continue(),
    );
    await page.getByRole('textbox', { name: 'What value' }).fill('Juice boxes');
    await publishButton(page).click();
    await expect(
      page
        .getByText('A change didn’t save. Fix it, then publish.', { exact: true })
        .locator('visible=true'),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await storedStatus(page, draft.id)).toBe('draft');
  });

  test('an edit typed just before going to another tab is what Publish checks', async ({
    page,
  }) => {
    const draft = await createDraft(page.request, {
      title: `Typed then left ${Date.now()}`,
      values: { what: 'Juice', date: '2030-04-06' },
    });
    await page.goto(`/app/signups/${draft.id}/build`);
    await page.getByRole('button', { name: /^Edit slot .*Juice/ }).click();
    // Well inside the 800 ms a cell waits before it saves.
    await page.getByRole('textbox', { name: 'What value' }).fill('TBD');
    await page.getByRole('tab', { name: 'Responses' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/signups/${draft.id}/responses$`));
    await publishButton(page).click();
    const check = page.getByRole('dialog', { name: 'Before people see it' });
    await expect(check).toContainText('Sat, Apr 6 still says “TBD”.');
    expect((await storedSlots(page, draft.id))[0]?.values.what).toBe('TBD');
    expect(await storedStatus(page, draft.id)).toBe('draft');
  });
});

test.describe('signed-out organizer links', () => {
  test('a deep link goes to sign-in and comes back to the same page', async ({ page, context }) => {
    const deepLink = `/app/signups/${seed.draftSignupId}/build?from=email`;
    await page.goto(deepLink);
    await expect(page).toHaveURL(`${BASE_URL}/login?callbackUrl=${encodeURIComponent(deepLink)}`);

    // Every way of signing in from this page (the emailed link, the code, a
    // provider, or the page noticing a session) goes to the callbackUrl it read
    // from its own URL. A reload with a session cookie is the shortest of them,
    // and it sends no email, so it cannot retire the code login-code.spec.ts
    // mints for the same organizer.
    await loginAsSeededOrganizer(context);
    await page.reload();
    await expect(page).toHaveURL(`${BASE_URL}${deepLink}`);
    await expect(page.getByRole('heading', { level: 1, name: seed.draftTitle })).toBeVisible();
  });

  test('a session that ends mid-visit sends the next page to sign-in', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    await page.goto('/app');
    await expect(page.getByRole('heading', { name: 'Your signups' })).toBeVisible();

    await context.clearCookies();
    // A client-side navigation re-renders the page but not the shared layout,
    // so it is the page's own check that has to send the organizer to sign in.
    await page.locator('header').getByTitle('Settings').click();
    await expect(page).toHaveURL(
      `${BASE_URL}/login?callbackUrl=${encodeURIComponent('/app/settings')}`,
    );
  });
});
