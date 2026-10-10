import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';
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

  test('commit dialog has no WCAG A/AA violations', async ({ page }) => {
    await page.goto(`/s/${seed.publicSlug}`);
    const row = page.locator('li').filter({ hasText: seed.openSlotLabel });
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

  test('Remove confirmation on the Responses tab has no WCAG A/AA violations', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    const created = await page.request.post('/api/signups', {
      data: {
        title: `Axe remove ${Date.now()}`,
        description: '',
        tags: [],
        visibility: 'unlisted',
        settings: {},
      },
    });
    expect(created.ok()).toBe(true);
    const signupId = (await created.json()).data.id as string;
    const added = await page.request.post(`/api/signups/${signupId}/slots`, {
      data: { capacity: 1, values: { what: 'Fruit and water' } },
    });
    expect(added.ok()).toBe(true);
    const slotId = (await added.json()).data.id as string;
    expect((await page.request.post(`/api/signups/${signupId}/publish`)).ok()).toBe(true);
    const committed = await page.request.post(`/api/slots/${slotId}/commitments`, {
      // An address of its own, from the range kept for documentation (RFC
      // 5737), so this sign-up doesn't count against the per-IP limit other
      // specs' sign-ups share.
      headers: { 'x-forwarded-for': '203.0.113.79' },
      data: { name: 'Sam Example', email: `sam+${Date.now()}@example.test`, quantity: 1 },
    });
    expect(committed.ok()).toBe(true);

    await page.goto(`/app/signups/${signupId}/responses`);
    await page.getByRole('button', { name: 'Remove Sam Example from Fruit and water' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Confirm removal' })).toBeVisible();

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
});
