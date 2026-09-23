import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { BASE_URL, loadSeed } from './helpers/fixtures';

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
