import { expect, test } from '@playwright/test';
import { BASE_URL } from './helpers/fixtures';

/**
 * The sign-in pages' words come from the catalog (`auth`), in the instance's
 * `DEFAULT_LOCALE` once it has shipped to organizers, else English: English
 * here, since this server sets none. In the production build the web process
 * formats them from the precompiled catalog (precompiled-messages.spec.ts says
 * why that matters), so these check the messages with an argument come out
 * whole and word for word as they read before the catalog: the address once a
 * link is sent (cut around the address on the server, and put back together
 * in the browser), the link's lifetime, and the address on the confirm page.
 */
test.describe('the sign-in pages, in English', () => {
  test('the sign-in page, and the line under the button once a link is sent', async ({ page }) => {
    const email = `e2e-text-${Date.now()}@example.com`;
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/^Sign in · /);
    await expect(page.locator('main').locator('..')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to OpenSignup');
    await expect(
      page.getByText("Enter your email and we'll send you a magic link to sign in. No passwords."),
    ).toBeVisible();

    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send magic link' }).click();
    await expect(page.getByRole('button', { name: 'Sent — check your email' })).toBeVisible();
    const line = page.getByText(/^Link sent to /);
    await expect(line).toHaveText(`Link sent to ${email}. Check your inbox. Send again`);
    await expect(line.locator('strong')).toHaveText(email);
    await expect(page.getByText('Opened the email on another device?')).toBeVisible();
    await expect(
      page.getByText('Type the six-digit code from the email to sign in here instead.'),
    ).toBeVisible();
  });

  test('the check-your-email page says how long the link lasts', async ({ page }) => {
    await page.goto(`${BASE_URL}/login/check?callbackUrl=%2Fapp`);
    await expect(page).toHaveTitle(/^Check your email · /);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your email');
    await expect(page.getByText(/^We sent a sign-in link/)).toHaveText(
      /^We sent a sign-in link to your inbox\. Click it to continue\. The link expires in \d+ (minutes?|hours?|days?)( \d+ (minutes?|hours?))?\. This page will move on by itself once you have signed in\.$/,
    );
  });

  test('the confirm page names the address it signs in', async ({ page }) => {
    // Never followed: the token is made up, and the page only links to it.
    const next = `${BASE_URL}/api/auth/callback/nodemailer?token=not-a-real-token&email=pat%40example.com`;
    await page.goto(`${BASE_URL}/login/confirm?next=${encodeURIComponent(next)}`);
    await expect(page).toHaveTitle(/^Sign in · /);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to OpenSignup');
    const line = page.getByText(/^Click the button below/);
    await expect(line).toHaveText('Click the button below to sign in as pat@example.com.');
    await expect(line.locator('strong')).toHaveText('pat@example.com');
    await expect(page.getByRole('link', { name: 'Sign in →' })).toHaveAttribute('href', next);
    await expect(page.getByRole('link', { name: 'Use a different email' })).toBeVisible();
  });
});
