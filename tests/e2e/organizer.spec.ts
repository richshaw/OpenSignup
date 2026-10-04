import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { BASE_URL, loadSeed } from './helpers/fixtures';
import { createPublishedSignup } from './helpers/signups';

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
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Publish flow ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const draftId = (await created.json()).data.id as string;

    await page.goto(`/app/signups/${draftId}/build`);
    // Desktop header shows Publish directly; mobile tucks it behind the
    // "More actions" sheet.
    const desktopPublish = page.getByRole('button', { name: 'Publish', exact: true });
    if (await desktopPublish.isVisible()) {
      await desktopPublish.click();
    } else {
      await page.getByRole('button', { name: 'More actions' }).click();
      await page.getByRole('button', { name: 'Publish signup' }).click();
    }
    await expect(page.getByText('Signup published')).toBeVisible();
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
    const required = page.getByRole('radio', { name: 'Required' });
    const optional = page.getByRole('radio', { name: 'Optional' });
    await expect(required).toBeChecked();

    await optional.check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Saved');
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
    await expect(page.getByRole('status')).toHaveText('Saved');
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
