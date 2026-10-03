import { expect, test } from '@playwright/test';
import { BASE_URL } from './helpers/fixtures';

/**
 * React resets an uncontrolled field once a form action runs, so a refused
 * address used to vanish and had to be typed again to fix one character.
 * The rate-limit and send-failure cases are in login-form.test.tsx, which
 * doesn't spend the real per-IP allowance.
 */
test('a refused email address stays in the box so it can be corrected', async ({ page }) => {
  // Typing before the form hydrates would race React, not test it.
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  const email = page.getByLabel('Email');
  await email.fill('pat@example');
  await page.getByRole('button', { name: 'Send magic link' }).click();
  const error = page.getByText('doesn’t look like a valid email address');
  await expect(error).toBeVisible();
  await expect(email).toHaveValue('pat@example');

  await email.fill('pat@example.com');
  await expect(error).toBeHidden();
});
