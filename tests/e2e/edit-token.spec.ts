import { expect, test } from '@playwright/test';
import { GONE_PAGE } from '@/app/s/[slug]/gone-message';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

test.describe('token-gated commitment editing', () => {
  test('participant edits notes, cancels, then finds the link says so', async ({ page }) => {
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

    // The link in the confirmation email never changes. Followed again, it
    // says the sign-up was cancelled instead of offering a form that fails.
    await page.goto(editUrl);
    await expect(page.getByRole('heading', { name: 'This sign-up was cancelled' })).toBeVisible();
    await expect(
      page.getByText('Go back to the signup if you want to sign up again.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the signup' })).toHaveAttribute(
      'href',
      `/s/${seed.editSlug}`,
    );
    await expect(page.getByLabel('Name')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel signup' })).toHaveCount(0);

    // Only the right token learns that: a wrong one still gets the page a
    // live sign-up's wrong token gets.
    const wrong = await page.goto(editUrl.replace(/token=[^&]+/, 'token=invalid-token'));
    expect(wrong?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: GONE_PAGE.editLink.title })).toBeVisible();
    await expect(page.getByText('This sign-up was cancelled')).toHaveCount(0);
  });
});
