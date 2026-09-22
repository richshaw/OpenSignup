import { expect, test } from '@playwright/test';
import { BASE_URL, loadSeed } from './helpers/fixtures';
import { mintLoginCodeForTest } from './helpers/seed';

/**
 * The magic-link email carries a six-digit code; the sign-in page offers to
 * take it after the link is sent. The email itself goes to the console
 * transport, so this only checks the form appears and rejects a wrong code
 * with a real message; the code logic is covered by unit and db tests.
 */
test('after sending a magic link, a code can be entered and a wrong code is rejected', async ({ page }) => {
  const email = `e2e-code-${Date.now()}@example.com`;
  await page.goto(`${BASE_URL}/login?callbackUrl=%2Fapp`);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send magic link' }).click();
  await expect(page.getByRole('button', { name: /Sent/ })).toBeVisible();
  const code = page.getByPlaceholder('123456');
  await expect(code).toBeVisible();
  await code.fill('000000');
  await page.getByRole('button', { name: 'Sign in with code' }).click();
  await expect(page.locator('#code-error')).toContainText('not right');
  // Still not signed in.
  await page.goto(`${BASE_URL}/app`);
  await expect(page).toHaveURL(/\/login/);
});

test('a correct code signs this browser in and lands on the requested page', async ({ page }) => {
  const { organizerEmail } = loadSeed();
  await page.goto(`${BASE_URL}/login?callbackUrl=%2Fapp%2Fsettings`);
  await page.getByLabel('Email').fill(organizerEmail);
  await page.getByRole('button', { name: 'Send magic link' }).click();
  await expect(page.getByPlaceholder('123456')).toBeVisible();
  // Minted after the send, so it is the live code for this address; it wraps a
  // real Auth.js callback, so redeeming it is the same as clicking the link.
  const code = await mintLoginCodeForTest(organizerEmail, `${BASE_URL}/app/settings`);
  await page.getByPlaceholder('123456').fill(code);
  await page.getByRole('button', { name: 'Sign in with code' }).click();
  await page.waitForURL(/\/app\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  // The session cookie arrived: a fresh navigation stays signed in.
  await page.goto(`${BASE_URL}/app`);
  await expect(page).toHaveURL(/\/app$/);
});
