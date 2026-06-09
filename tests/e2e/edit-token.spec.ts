import { expect, test } from '@playwright/test';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

test.describe('token-gated commitment editing', () => {
  test('participant edits notes, then cancels their commitment', async ({ page }) => {
    // Own state per attempt: commit via the API so projects and retries never
    // edit/cancel the same commitment twice.
    const name = 'Casey Editor';
    const created = await page.request.post(`/api/slots/${seed.editSlotId}/commitments`, {
      data: { name, email: `casey+${Date.now()}@example.test`, quantity: 1 },
    });
    expect(created.ok()).toBe(true);
    const editUrl = (await created.json()).data.editUrl as string;

    await page.goto(editUrl);
    await expect(page.getByRole('heading', { name: 'Your signup' })).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveValue(name);

    await page.getByLabel('Notes').fill('Bringing plates');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');

    // Two-step cancel: confirm dialog, then redirect back to the public page.
    await page.getByRole('button', { name: 'Cancel signup' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Confirm cancellation' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes, cancel' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${seed.editSlug}$`));
  });

  test('invalid token renders not-found', async ({ page }) => {
    const response = await page.goto(
      `/s/${seed.editSlug}/c/${seed.editCommitmentId}?token=invalid-token`,
    );
    expect(response?.status()).toBe(404);
  });

  test('missing token renders not-found', async ({ page }) => {
    const response = await page.goto(`/s/${seed.editSlug}/c/${seed.editCommitmentId}`);
    expect(response?.status()).toBe(404);
  });
});
