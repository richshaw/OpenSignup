import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

// An organizer who opens their own signup's public link gets a strip across
// the top that leads back to its Responses and Build tabs. It sits outside
// <main>, so visitors see the page under it unchanged.
test.describe('organizer strip on the public page', () => {
  test('a signed-out visitor sees no strip', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    await expect(page.getByRole('heading', { name: seed.publicTitle })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Organizer' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'See responses' })).toHaveCount(0);
  });

  test('the signup’s organizer sees the strip, and it leads to Responses and Build', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    await page.goto(`/s/${seed.publicSlug}`);
    const strip = page.getByRole('navigation', { name: 'Organizer' });
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('Your signup. Only organizers see this bar.');
    // Above the page's content, not inside it.
    await expect(page.locator('main nav[aria-label="Organizer"]')).toHaveCount(0);
    await expect(strip.getByRole('link', { name: 'Edit signup' })).toHaveAttribute(
      'href',
      /^\/app\/signups\/sig_\w+\/build$/,
    );

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);

    await strip.getByRole('link', { name: 'See responses' }).click();
    await expect(page).toHaveURL(/\/app\/signups\/sig_\w+\/responses$/);
    await expect(page.getByRole('heading', { name: seed.publicTitle })).toBeVisible();
  });

  test('on a phone the strip keeps its gutter and the page does not scroll sideways', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsSeededOrganizer(context);
    await page.goto(`/s/${seed.publicSlug}`);
    const strip = page.getByRole('navigation', { name: 'Organizer' });
    await expect(strip).toBeVisible();
    const text = await strip.getByText('Your signup.').boundingBox();
    expect(text?.x).toBe(16);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
