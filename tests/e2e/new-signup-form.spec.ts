import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';

/**
 * The browser checks the title's length with its spaces, the server after
 * trimming them, so ` a ` gets past the form and is refused. What was typed
 * has to survive that refusal.
 */
test.describe('the New signup form', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  test('keeps the title and description when the server refuses the title', async ({ page }) => {
    await page.goto('/app/signups/new?manual=1');
    const title = page.getByLabel('Title');
    const description = page.getByLabel('Description (optional)');
    await title.fill(' a ');
    await description.fill('Bring a plate.\nNuts are fine.');
    await page.getByRole('button', { name: 'Create signup' }).click();

    await expect(page.getByText('Title must be at least 2 characters.')).toBeVisible();
    await expect(title).toHaveValue(' a ');
    await expect(description).toHaveValue('Bring a plate.\nNuts are fine.');
    await expect(page).toHaveURL(/\/app\/signups\/new\?manual=1$/);
  });

  test('puts Title at the top of the card, with no gap from the action’s hidden inputs', async ({
    page,
  }) => {
    await page.goto('/app/signups/new?manual=1');
    // useActionState puts hidden inputs at the start of the <form>; spacing
    // that counts them as children pushed Title down by an extra gap.
    const gap = await page.locator('form:has(input[name="title"])').evaluate((form) => {
      const label = form.querySelector('label');
      if (!label) return null;
      const padding = parseFloat(getComputedStyle(form).paddingTop);
      const borderTop = parseFloat(getComputedStyle(form).borderTopWidth);
      return (
        label.getBoundingClientRect().top - form.getBoundingClientRect().top - borderTop - padding
      );
    });
    expect(gap).toBe(0);
  });

  test('lands on the Build page of a signup it creates', async ({ page }) => {
    await page.goto('/app/signups/new?manual=1');
    await page.getByLabel('Title').fill(`Snack duty ${Date.now()}`);
    await page.getByRole('button', { name: 'Create signup' }).click();
    await expect(page).toHaveURL(/\/app\/signups\/sig_[^/]+\/build/);
  });
});
