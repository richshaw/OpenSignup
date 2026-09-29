import { expect, test } from '@playwright/test';
import { BASE_URL } from './helpers/fixtures';

test('a failed sign-in keeps the email available to correct', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  const email = page.getByLabel('Email', { exact: true });
  await email.fill('not-an-email');
  await page.getByRole('button', { name: 'Send magic link' }).click();

  await expect(page.getByRole('alert')).toContainText('valid email address');
  await expect(email).toHaveValue('not-an-email');
  await expect(email).toBeEnabled();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(email).toBeFocused();
  await expect(email).toHaveValue('not-an-email');

  await email.fill('still-invalid');
  await email.press('Enter');
  await expect(page.getByRole('alert')).toContainText('valid email address');
  await expect(email).toHaveValue('still-invalid');
});
