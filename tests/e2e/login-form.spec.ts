import { expect, test } from '@playwright/test';
import { BASE_URL } from './helpers/fixtures';

/**
 * React resets an uncontrolled field once a form action runs, so a refused
 * address used to vanish and had to be typed again to fix one character.
 */
test('a refused email address stays in the box so it can be corrected', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  const email = page.getByLabel('Email');
  await email.fill('pat@example');
  await page.getByRole('button', { name: 'Send magic link' }).click();
  await expect(page.getByText('doesn’t look like a valid email address')).toBeVisible();
  await expect(email).toHaveValue('pat@example');
});
