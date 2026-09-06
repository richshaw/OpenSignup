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

  test('saved reminder field survives the post-save re-render', async ({ page }) => {
    // Regression: server actions used to read the signup through
    // `signups.cached`, whose React cache() memo is request-scoped. The read
    // happened before the write, and `revalidatePath` re-renders inside that
    // same request, so the page came back showing the value that had just been
    // overwritten. The row was correct; only a reload revealed it. Asserting
    // after a reload would pass either way, so this checks the rendered value
    // once the action's own round trip has completed.
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Reminder settings ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const signupId = (await created.json()).data.id as string;

    await page.goto(`/app/signups/${signupId}/settings`);
    const select = page.getByLabel('Reminder date field');
    await expect(select).toHaveValue('');

    // 'date' is the DEFAULT_TEMPLATE date field applied to every new signup.
    await select.selectOption('date');
    const save = page.getByRole('button', { name: 'Save' });
    const saved = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes(`/app/signups/${signupId}/settings`),
    );
    await save.click();
    await saved;
    // useFormStatus clears `pending` only once the action resolves and React
    // has committed the re-rendered tree, so this is the point the stale value
    // would land.
    await expect(save).toBeEnabled();

    await expect(select).toHaveValue('date');
  });

  test('unauthenticated visitor is redirected to login', async ({ browser }) => {
    const anonContext = await browser.newContext();
    const page = await anonContext.newPage();
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
    await anonContext.close();
  });
});
