import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

test.describe('accessibility', () => {
  test('public signup page has no WCAG A/AA violations', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    await expect(page.getByRole('heading', { name: seed.publicTitle })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  });

  for (const { name, slug, slotLabel } of [
    { name: 'commit dialog', slug: seed.publicSlug, slotLabel: seed.openSlotLabel },
    {
      name: 'commit dialog with the email optional',
      slug: seed.optionalEmailSlug,
      slotLabel: seed.optionalEmailSlotLabel,
    },
  ]) {
    test(`${name} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(`/s/${slug}`);
      const row = page.locator('li').filter({ hasText: slotLabel });
      await row.getByRole('button', { name: 'Sign up' }).click();
      await expect(page.getByLabel('Your name')).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    });
  }
});
