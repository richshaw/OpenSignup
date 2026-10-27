import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

// An organizer who opens their own signup's public link gets a bar that leads
// back to its Responses and Build tabs. Visitors see the page without it.
test.describe('organizer bar on the public page', () => {
  test('a signed-out visitor sees no bar', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    await expect(page.getByRole('heading', { name: seed.publicTitle })).toBeVisible();
    await expect(page.getByText('This is your signup.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'See responses' })).toHaveCount(0);
  });

  test('the signup’s organizer sees the bar, and it leads to Responses and Build', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    await page.goto(`/s/${seed.publicSlug}`);
    await expect(page.getByText('This is your signup.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit signup' })).toHaveAttribute(
      'href',
      /^\/app\/signups\/sig_\w+\/build$/,
    );

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);

    await page.getByRole('link', { name: 'See responses' }).click();
    await expect(page).toHaveURL(/\/app\/signups\/sig_\w+\/responses$/);
    await expect(page.getByRole('heading', { name: seed.publicTitle })).toBeVisible();
  });
});
