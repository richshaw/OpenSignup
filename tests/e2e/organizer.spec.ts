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
    // Regression: React resets a form's uncontrolled fields once its action
    // resolves, and that reset restores each control to its DOM default — for
    // a select, the option carrying the `selected` attribute. React writes that
    // attribute from `defaultValue` at mount and leaves it alone on re-render,
    // so the re-rendered `defaultValue` never reached the DOM and the reset
    // snapped the control back to the page-load selection. The server was
    // never at fault: it re-rendered with the new value and the row was
    // correct throughout, which is why only a reload showed the truth. The fix
    // keys the select on the saved value so a save remounts it. Asserting
    // after a reload would pass either way, and asserting straight after the
    // click would pass on the value the user just picked — the reset lands
    // slightly later — so this checks the rendered value once the action's own
    // round trip has completed.
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

    // A second date field, so there is something other than the template's
    // `date` (the anchor every new signup starts on) to switch to.
    const added = await page.request.post(`/api/signups/${signupId}/fields`, {
      data: { ref: 'setup-day', label: 'Setup day', fieldType: 'date', config: { fieldType: 'date' } },
    });
    expect(added.ok()).toBe(true);

    await page.goto(`/app/signups/${signupId}/settings`);
    const select = page.getByLabel('Reminder date field');
    await expect(select).toHaveValue('date');

    await select.selectOption('setup-day');
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

    await expect(select).toHaveValue('setup-day');
  });

  test('unauthenticated visitor is redirected to login', async ({ browser }) => {
    const anonContext = await browser.newContext();
    const page = await anonContext.newPage();
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
    await anonContext.close();
  });
});
