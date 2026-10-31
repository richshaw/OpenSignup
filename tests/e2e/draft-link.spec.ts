import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { BASE_URL } from './helpers/fixtures';
import { createDraft } from './helpers/signups';

// A draft's public link works unchanged once it's published, so it never asks
// for a new link. Its own organizer gets told it's their draft, with a way
// back to it; everyone else gets the visitor's message.
test.describe('a draft’s public link', () => {
  test('tells a visitor to check back, and its organizer that it is theirs', async ({
    page,
    context,
    browser,
  }) => {
    await loginAsSeededOrganizer(context);
    const draft = await createDraft(page.request, { title: `Unpublished ${Date.now()}` });

    await page.goto(`/s/${draft.slug}`);
    await expect(page.getByRole('heading', { name: 'Only you can see this draft' })).toBeVisible();
    await expect(page.getByText(/until you publish it\. The link stays the same\./)).toBeVisible();
    await page.getByRole('link', { name: 'Open your draft' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/signups/${draft.id}/build$`));

    const visitor = await browser.newPage();
    try {
      await visitor.goto(`${BASE_URL}/s/${draft.slug}`);
      await expect(
        visitor.getByRole('heading', { name: 'This signup isn’t ready yet' }),
      ).toBeVisible();
      await expect(visitor.getByText(/This link will work once they do/)).toBeVisible();
      await expect(visitor.getByText(/updated link/)).toHaveCount(0);
      await expect(visitor.getByRole('link', { name: 'Open your draft' })).toHaveCount(0);
    } finally {
      await visitor.close();
    }
  });
});
