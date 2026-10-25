import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';

const NARROW = { width: 320, height: 568 };
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** A fresh published signup with one slot, so the header shows its public link. */
async function createPublishedSignup(page: Page) {
  const created = await page.request.post('/api/signups', {
    data: {
      title: `Link chip ${Date.now()}`,
      description: '',
      tags: [],
      visibility: 'unlisted',
      settings: {},
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()).data as { id: string };
  const added = await page.request.post(`/api/signups/${id}/slots`, {
    data: { capacity: 1, values: { what: 'Fruit and water' } },
  });
  expect(added.ok()).toBe(true);
  expect((await page.request.post(`/api/signups/${id}/publish`)).ok()).toBe(true);
  return id;
}

/**
 * The phone and computer headers are both in the page, one hidden by CSS, so
 * each control is looked up among the visible ones.
 */
function chipButtons(page: Page) {
  return [
    page.getByRole('button', { name: 'Copy public link' }).locator('visible=true'),
    page.getByRole('link', { name: 'Open public page' }).locator('visible=true'),
  ];
}

async function size(target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error('not on the page');
  return box;
}

test.describe('public link chip', () => {
  test('copy and open are 44px square on a phone and unchanged on a computer', async ({
    page,
    context,
  }) => {
    await loginAsSeededOrganizer(context);
    const id = await createPublishedSignup(page);

    await page.setViewportSize(PHONE);
    await page.goto(`/app/signups/${id}/build`);
    for (const button of chipButtons(page)) {
      // 44px, the usual smallest touch target. Sub-pixel rounding, hence 43.5.
      const box = await size(button);
      expect(box.width, 'phone touch width').toBeGreaterThanOrEqual(43.5);
      expect(box.height, 'phone touch height').toBeGreaterThanOrEqual(43.5);
    }

    // A pointer is the likely input here, so they keep their compact size:
    // a 16px icon with 6px around it.
    await page.setViewportSize(DESKTOP);
    for (const button of chipButtons(page)) {
      const box = await size(button);
      expect(Math.round(box.width)).toBe(28);
      expect(Math.round(box.height)).toBe(28);
    }

    // The wider buttons take room from the truncated URL, not the page.
    await page.setViewportSize(NARROW);
    await expect(chipButtons(page)[0]!).toBeVisible();
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(scrolls, 'no sideways scroll at 320px').toBe(false);
  });
});
