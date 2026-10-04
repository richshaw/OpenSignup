import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';

/**
 * A fresh published signup per test, with one single-spot slot: the test owns
 * its state, and the slot offering "Sign up" again shows the spot came back.
 */
async function createSignupWithSlot(page: Page) {
  const created = await page.request.post('/api/signups', {
    data: {
      title: `Remove flow ${Date.now()}`,
      description: '',
      tags: [],
      visibility: 'unlisted',
      settings: {},
    },
  });
  expect(created.ok()).toBe(true);
  const { id: signupId, slug } = (await created.json()).data as { id: string; slug: string };
  const added = await page.request.post(`/api/signups/${signupId}/slots`, {
    data: { capacity: 1, values: { what: 'Fruit and water' } },
  });
  expect(added.ok()).toBe(true);
  const slotId = (await added.json()).data.id as string;
  expect((await page.request.post(`/api/signups/${signupId}/publish`)).ok()).toBe(true);
  return { signupId, slug, slotId };
}

/** Signs Sam Example up for the slot, and returns their edit link. */
async function signUp(request: APIRequestContext, slotId: string) {
  const committed = await request.post(`/api/slots/${slotId}/commitments`, {
    data: { name: 'Sam Example', email: `sam+${Date.now()}@example.test`, quantity: 1 },
  });
  expect(committed.ok()).toBe(true);
  return (await committed.json()).data.editUrl as string;
}

test.describe('Responses tab', () => {
  test('organizer removes one person and their spot opens up', async ({
    page,
    context,
    browser,
  }) => {
    await loginAsSeededOrganizer(context);
    const { signupId, slug, slotId } = await createSignupWithSlot(page);

    // The participant signs up from a browser of their own, which keeps the
    // cookie that marks their sign-up on the public page.
    const participant = await browser.newContext();
    try {
      const visitor = await participant.newPage();
      const editUrl = await signUp(visitor.request, slotId);

      await visitor.goto(`/s/${slug}`);
      const slotRow = visitor.locator('li').filter({ hasText: 'Fruit and water' });
      // Theirs: Edit in place of Sign up, and the banner.
      await expect(slotRow.getByRole('link', { name: 'Edit' })).toBeVisible();
      await expect(slotRow.getByRole('button', { name: 'Sign up' })).toHaveCount(0);
      await expect(visitor.getByText("You're signed up")).toBeVisible();

      await page.goto(`/app/signups/${signupId}/responses`);
      const row = page.getByRole('row').filter({ hasText: 'Sam Example' });
      const remove = row.getByRole('button', { name: 'Remove' });
      await remove.click();
      const confirm = page.getByRole('alertdialog', { name: 'Confirm removal' });
      await expect(confirm).toContainText(
        'Remove Sam Example from Fruit and water? Their spot opens up for someone else. ' +
          'They won’t get an email about it.',
      );
      await expect(confirm.getByRole('button', { name: 'Keep' })).toBeFocused();
      // Keep changes nothing, and hands focus back to Remove.
      await confirm.getByRole('button', { name: 'Keep' }).click();
      await expect(confirm).toHaveCount(0);
      await expect(row.getByRole('cell', { name: 'confirmed' })).toBeVisible();
      await expect(remove).toBeFocused();
      // So does Escape.
      await page.keyboard.press('Enter');
      await expect(confirm).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(confirm).toHaveCount(0);
      await expect(remove).toBeFocused();

      await remove.click();
      await confirm.getByRole('button', { name: 'Yes, remove' }).click();
      const status = row.getByRole('cell', { name: 'cancelled' });
      await expect(status).toBeVisible();
      await expect(remove).toHaveCount(0);
      // The button is gone; focus stays in the row, on what happened.
      await expect(status).toBeFocused();

      // The spot is free again, and their page no longer says it is theirs.
      await visitor.reload();
      await expect(slotRow.getByRole('button', { name: 'Sign up' })).toBeVisible();
      await expect(slotRow.getByRole('link', { name: 'Edit' })).toHaveCount(0);
      await expect(visitor.getByText("You're signed up")).toHaveCount(0);

      // Their edit link says the sign-up was cancelled, not by whom.
      await visitor.goto(editUrl);
      await expect(
        visitor.getByRole('heading', { name: 'This sign-up was cancelled' }),
      ).toBeVisible();
    } finally {
      await participant.close();
    }
  });

  test('Keep and Escape wait while a removal is in flight', async ({ page, context }) => {
    await loginAsSeededOrganizer(context);
    const { signupId, slotId } = await createSignupWithSlot(page);
    await signUp(page.request, slotId);

    // Hold the server action's request until the test lets it go.
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/app/signups/${signupId}/responses`, async (route) => {
      if (route.request().method() === 'POST') await released;
      await route.continue();
    });

    await page.goto(`/app/signups/${signupId}/responses`);
    const row = page.getByRole('row').filter({ hasText: 'Sam Example' });
    await row.getByRole('button', { name: 'Remove' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Confirm removal' });
    await confirm.getByRole('button', { name: 'Yes, remove' }).click();
    await expect(confirm.getByRole('button', { name: 'Removing…' })).toBeDisabled();
    await expect(confirm.getByRole('button', { name: 'Keep' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeVisible();

    release();
    await expect(row.getByRole('cell', { name: 'cancelled' })).toBeFocused();
  });

  test('a refusal shows in the confirmation, and is gone when it opens again', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    const { signupId, slotId } = await createSignupWithSlot(page);
    await signUp(page.request, slotId);

    await page.goto(`/app/signups/${signupId}/responses`);
    const row = page.getByRole('row').filter({ hasText: 'Sam Example' });
    await row.getByRole('button', { name: 'Remove' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Confirm removal' });

    // The signup is deleted in another tab while the confirmation is open.
    const other = await context.newPage();
    await other.goto(`/app/signups/${signupId}/settings`);
    await other.getByRole('button', { name: 'Delete signup' }).click();
    await other.getByRole('button', { name: 'Yes, delete signup' }).click();
    await other.waitForURL(/\/app$/);
    await other.close();

    await confirm.getByRole('button', { name: 'Yes, remove' }).click();
    await expect(confirm.getByRole('alert')).toHaveText('commitment not found');
    // Focus left the button while it was disabled; it comes back to Keep, so
    // Escape still closes the confirmation.
    await expect(confirm.getByRole('button', { name: 'Keep' })).toBeFocused();
    await page.keyboard.press('Escape');
    const remove = row.getByRole('button', { name: 'Remove' });
    await expect(remove).toBeFocused();
    await remove.click();
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('alert')).toHaveCount(0);
  });

  test('fits a phone screen: the table scrolls, the page does not', async ({ page, context }) => {
    await loginAsSeededOrganizer(context);
    await page.setViewportSize({ width: 390, height: 844 });
    const { signupId, slotId } = await createSignupWithSlot(page);
    await signUp(page.request, slotId);

    await page.goto(`/app/signups/${signupId}/responses`);
    await expect(page.getByRole('row').filter({ hasText: 'Sam Example' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
