import { expect, test } from '@playwright/test';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

test.describe('public commit flow', () => {
  test('participant signs up for an open slot and gets an edit link', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    await expect(page.getByRole('heading', { name: seed.publicTitle })).toBeVisible();

    const row = page.locator('li').filter({ hasText: seed.openSlotLabel });
    await row.getByRole('button', { name: 'Sign up' }).click();

    // Unique email per attempt so CI retries don't trip the duplicate-commit
    // conflict check.
    const email = `pat+${Date.now()}@example.test`;
    await page.getByLabel('Your name').fill('Pat Tester');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByRole('heading', { name: "You're in." })).toBeVisible();
    const editLink = page.getByRole('link', {
      name: new RegExp(`/s/${seed.publicSlug}/c/`),
    });
    await expect(editLink).toBeVisible();

    // Closing the dialog refreshes; the cookie marks the row as ours.
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(row.getByRole('link', { name: 'Edit' })).toBeVisible();
  });

  test('full slot shows Full and no sign-up affordance', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    const row = page.locator('li').filter({ hasText: seed.fullSlotLabel });
    await expect(row.getByText('Full')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Sign up' })).toHaveCount(0);
    await expect(row.getByText('1/1')).toBeVisible();
  });

  test('header links the instance name home and no longer says "Public signup"', async ({
    page,
  }) => {
    await page.goto(`/s/${seed.publicSlug}`);

    // The brand mark is the page's only trust signal for who is serving it, so
    // assert it is present, non-empty and points home. Its text is whatever
    // NEXT_PUBLIC_INSTANCE_NAME is set to, so match on the link, not the copy.
    const brand = page.locator('main a[href="/"]').first();
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText(/\S/);

    // The removed segment. A participant arrives from a shared link, and
    // "Public" reads as "publicly listed", which this page is not — it is
    // served with robots: noindex.
    await expect(page.getByText('Public signup')).toHaveCount(0);
  });

  test('unknown slug renders not-found', async ({ page }) => {
    const response = await page.goto('/s/this-slug-does-not-exist');
    expect(response?.status()).toBe(404);
  });
});
