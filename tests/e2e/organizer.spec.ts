import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';

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
