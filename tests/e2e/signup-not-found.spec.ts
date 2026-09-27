import { expect, test } from '@playwright/test';
import { GONE_PAGE } from '@/app/s/[slug]/gone-message';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

const editLink = (slug: string, id: string, token?: string) =>
  `/s/${slug}/c/${id}${token === undefined ? '' : `?token=${token}`}`;

// A deleted signup must look exactly like one that never existed, and a
// deleted signup's edit link like a live one's with a bad token: same status,
// same message, nothing of the signup's own.
const CASES = [
  { name: 'unknown slug', path: '/s/this-slug-does-not-exist', copy: GONE_PAGE.signup },
  { name: 'deleted signup', path: `/s/${seed.deletedSlug}`, copy: GONE_PAGE.signup },
  {
    name: 'edit link on a deleted signup',
    path: editLink(seed.deletedSlug, seed.deletedCommitmentId, seed.deletedToken),
    copy: GONE_PAGE.editLink,
  },
  {
    name: 'edit link with a wrong token',
    path: editLink(seed.editSlug, seed.editCommitmentId, 'invalid-token'),
    copy: GONE_PAGE.editLink,
  },
  {
    name: 'edit link with no token',
    path: editLink(seed.editSlug, seed.editCommitmentId),
    copy: GONE_PAGE.editLink,
  },
];

test.describe('signup not found', () => {
  for (const { name, path, copy } of CASES) {
    test(`${name} gets the participant not-found page with a 404`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
      await expect(page.getByText(copy.body)).toBeVisible();
      // Not Next's default page, and nothing from the deleted signup.
      await expect(page.getByText('This page could not be found')).toHaveCount(0);
      await expect(page.getByText('Removed Potluck')).toHaveCount(0);
      await expect(page).not.toHaveTitle(/Removed Potluck/);
    });
  }
});
