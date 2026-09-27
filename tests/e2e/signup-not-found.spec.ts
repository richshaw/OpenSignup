import { expect, test } from '@playwright/test';
import { GONE_PAGE } from '@/app/s/[slug]/gone-message';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

// A deleted signup must look exactly like one that never existed, on its own
// page and on its edit links: same status, same message, nothing of its own.
const CASES = [
  { name: 'unknown slug', path: '/s/this-slug-does-not-exist' },
  { name: 'deleted signup', path: `/s/${seed.deletedSlug}` },
  {
    name: 'edit link on a deleted signup',
    path: `/s/${seed.deletedSlug}/c/${seed.deletedCommitmentId}?token=${seed.deletedToken}`,
  },
  {
    name: 'edit link with a wrong token',
    path: `/s/${seed.editSlug}/c/${seed.editCommitmentId}?token=invalid-token`,
  },
];

test.describe('signup not found', () => {
  for (const { name, path } of CASES) {
    test(`${name} gets the participant not-found page with a 404`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: GONE_PAGE.title })).toBeVisible();
      await expect(page.getByText(GONE_PAGE.body)).toBeVisible();
      // Not Next's default page, and nothing from the deleted signup.
      await expect(page.getByText('This page could not be found')).toHaveCount(0);
      await expect(page.getByText('Removed Potluck')).toHaveCount(0);
      await expect(page).not.toHaveTitle(/Removed Potluck/);
    });
  }
});
